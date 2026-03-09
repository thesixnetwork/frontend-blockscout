/**
 * useRWAAuth — SIWE authentication hook for the RWA Note API.
 *
 * Flow:
 *   1. GET /api/rwa-auth?action=nonce&address=<wallet>  → { nonce, expiresAt }
 *   2. Sign the EIP-4361 SIWE message with the connected wallet
 *   3. POST /api/rwa-auth?action=login                  → { accessToken, refreshToken, expiresIn }
 *   4. Store accessToken in memory; refreshToken in localStorage (simple; upgrade to httpOnly cookie in prod)
 *   5. Auto-refresh before expiry via POST /api/rwa-auth?action=refresh
 *
 * Returns:
 *   getAccessToken() — returns a valid (possibly freshly refreshed) access token, or null
 *   login()         — triggers the full SIWE flow
 *   logout()        — clears stored tokens
 */

import React from 'react';
import { useSignMessage } from 'wagmi';

import appConfig from 'configs/app';

const REFRESH_TOKEN_KEY = 'rwa_refresh_token';
const EXPIRY_KEY = 'rwa_token_expiry';

// Keep access-token in module-level memory (cleared on page refresh, never in storage)
let _accessToken: string | null = null;

function storeRefreshToken(token: string, expiresIn: number) {
  try {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
    localStorage.setItem(EXPIRY_KEY, String(Date.now() + expiresIn * 1000));
  } catch {
    // localStorage might be unavailable (SSR / private-browsing)
  }
}

function loadRefreshToken(): { token: string; expiry: number } | null {
  try {
    const token = localStorage.getItem(REFRESH_TOKEN_KEY);
    const expiry = Number(localStorage.getItem(EXPIRY_KEY) ?? '0');
    if (token && expiry > Date.now()) {
      return { token, expiry };
    }
    clearTokenStorage();
  } catch {
    // ignore
  }
  return null;
}

function clearTokenStorage() {
  try {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
  } catch {
    // ignore
  }
  _accessToken = null;
}

// ── API helpers (call through Next.js proxy routes) ────────────────────────

async function fetchNonce(walletAddress: string): Promise<{ nonce: string; expiresAt: number }> {
  const res = await fetch(`/node-api/rwa-auth?action=nonce&address=${encodeURIComponent(walletAddress)}`);
  if (!res.ok) throw new Error(`Failed to get nonce: ${res.status}`);
  return res.json() as Promise<{ nonce: string; expiresAt: number }>;
}

async function callLogin(body: {
  walletAddress: string;
  message: string;
  signature: string;
}): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const res = await fetch('/node-api/rwa-auth?action=login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string | { message?: string } | string[]; statusCode?: number };
    // API may return { message: { message: "...", error: "...", statusCode: 400 } } (nested)
    // or { message: "string" } or { message: ["str1", "str2"] }
    let errMsg = `Login failed: ${ res.status }`;
    if (err.message) {
      if (typeof err.message === 'string') {
        errMsg = err.message;
      } else if (Array.isArray(err.message)) {
        errMsg = err.message.join(', ');
      } else if (typeof err.message === 'object' && err.message.message) {
        errMsg = err.message.message;
      }
    }
    throw new Error(errMsg);
  }
  return res.json() as Promise<{ accessToken: string; refreshToken: string; expiresIn: number }>;
}

async function callRefresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const res = await fetch('/node-api/rwa-auth?action=refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  return res.json() as Promise<{ accessToken: string; refreshToken: string; expiresIn: number }>;
}

// ── Build EIP-4361 SIWE message ─────────────────────────────────────────────

function buildSiweMessage(walletAddress: string, nonce: string): string {
  const domain = typeof window !== 'undefined' ? window.location.host : 'localhost';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const issuedAt = new Date().toISOString();
  const chainId = Number(appConfig.chain.id) || 98;
  // Strict EIP-4361 format — all required fields must be present in this exact order
  return [
    `${ domain } wants you to sign in with your Ethereum account:`,
    walletAddress,
    '',
    'Sign in to SixScan RWA Note API',
    '',
    `URI: ${ origin }`,
    'Version: 1',
    `Chain ID: ${ chainId }`,
    `Nonce: ${ nonce }`,
    `Issued At: ${ issuedAt }`,
  ].join('\n');
}

// ── Hook ────────────────────────────────────────────────────────────────────

interface UseRWAAuthResult {
  /** Returns a valid access token (refreshes silently if needed). Triggers SIWE login if no token. */
  getAccessToken: (walletAddress: string) => Promise<string>;
  /** Clear all stored tokens (call on wallet disconnect). */
  logout: () => void;
  /** True while SIWE signing / login is in progress. */
  isAuthenticating: boolean;
}

export default function useRWAAuth(): UseRWAAuthResult {
  const [isAuthenticating, setIsAuthenticating] = React.useState(false);
  const { signMessageAsync } = useSignMessage();

  /**
   * Silently refresh the access token using the stored refresh token.
   * Returns the new access token, or throws if the refresh token is missing / expired.
   */
  const silentRefresh = React.useCallback(async (): Promise<string> => {
    const stored = loadRefreshToken();
    if (!stored) throw new Error('No valid refresh token — please log in again.');
    const result = await callRefresh(stored.token);
    _accessToken = result.accessToken;
    storeRefreshToken(result.refreshToken, result.expiresIn);
    return result.accessToken;
  }, []);

  /**
   * Full SIWE login flow. Returns the access token.
   */
  const siweLogin = React.useCallback(async (walletAddress: string): Promise<string> => {
    setIsAuthenticating(true);
    try {
      const { nonce } = await fetchNonce(walletAddress);
      const message = buildSiweMessage(walletAddress, nonce);
      const signature = await signMessageAsync({ message });
      const result = await callLogin({ walletAddress, message, signature });
      _accessToken = result.accessToken;
      storeRefreshToken(result.refreshToken, result.expiresIn);
      return result.accessToken;
    } finally {
      setIsAuthenticating(false);
    }
  }, [signMessageAsync]);

  /**
   * Returns a valid access token. Tries:
   *   1. In-memory token (still valid)
   *   2. Silent refresh with stored refresh token
   *   3. Full SIWE login flow
   */
  const getAccessToken = React.useCallback(async (walletAddress: string): Promise<string> => {
    // 1. Use in-memory token if available
    if (_accessToken) return _accessToken;

    // 2. Try silent refresh
    try {
      return await silentRefresh();
    } catch {
      // Refresh token missing / expired — fall through to full login
    }

    // 3. Full SIWE login
    return siweLogin(walletAddress);
  }, [silentRefresh, siweLogin]);

  const logout = React.useCallback(() => {
    clearTokenStorage();
  }, []);

  return { getAccessToken, logout, isAuthenticating };
}
