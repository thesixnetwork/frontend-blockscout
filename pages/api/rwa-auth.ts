/**
 * RWA Auth proxy API routes
 * Handles SIWE authentication flow:
 *   GET  /api/rwa-auth?action=nonce&address=0x...  → GET /auth/nonce
 *   POST /api/rwa-auth?action=login                → POST /auth/login
 *   POST /api/rwa-auth?action=refresh              → POST /auth/refresh
 *
 * Note: The base URL should NOT include /api suffix (that is Swagger UI path).
 * NEXT_PUBLIC_RWA_BACKEND_API_URL should be the root e.g.
 * https://evm-sixscan-rwa-note-api-4ze6p6t2ga-as.a.run.app
 */

import type { NextApiRequest, NextApiResponse } from 'next';

// Strip trailing /api suffix if the env value was set with it (backward compat)
function getBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_RWA_BACKEND_API_URL ?? 'https://evm-sixscan-rwa-note-api-4ze6p6t2ga-as.a.run.app';
  return raw.replace(/\/api\/?$/, '').replace(/\/$/, '');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action, address } = req.query;

  if (!action || typeof action !== 'string') {
    return res.status(400).json({ error: 'Missing action parameter. Use: nonce | login | refresh' });
  }

  const BASE_URL = getBaseUrl();

  try {
    // ── GET /auth/nonce ──────────────────────────────────────────────────────
    if (action === 'nonce') {
      if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed. Use GET for nonce.' });
      }
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ error: 'Missing address query parameter.' });
      }
      const upstream = await fetch(`${ BASE_URL }/auth/nonce?address=${ encodeURIComponent(address) }`);
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    }

    // ── POST /auth/login ─────────────────────────────────────────────────────
    if (action === 'login') {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST for login.' });
      }
      const upstream = await fetch(`${ BASE_URL }/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    }

    // ── POST /auth/refresh ───────────────────────────────────────────────────
    if (action === 'refresh') {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST for refresh.' });
      }
      const upstream = await fetch(`${ BASE_URL }/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    }

    return res.status(400).json({ error: `Unknown action: ${ action }. Use: nonce | login | refresh` });

  } catch (error) {
    return res.status(500).json({
      error: 'Failed to proxy auth request',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export const config = {
  api: {
    bodyParser: { sizeLimit: '1mb' },
  },
};
