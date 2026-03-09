# SixScan RWA Note API — Frontend Integration Guide

> **Target:** Next.js frontend developers integrating the RWA Note API  
> **Base URL:** `https://evm-sixscan-rwa-note-api-4ze6p6t2ga-as.a.run.app`  
> **Swagger UI:** `https://evm-sixscan-rwa-note-api-4ze6p6t2ga-as.a.run.app/api`  
> **Networks:** `sixnet` | `fivenet`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Token Storage Strategy](#2-token-storage-strategy)
3. [Complete Auth Flow (SIWE Login)](#3-complete-auth-flow-siwe-login)
4. [API Reference — Auth Endpoints](#4-api-reference--auth-endpoints)
5. [API Reference — RWA Note Endpoints](#5-api-reference--rwa-note-endpoints)
6. [Error Handling Reference](#6-error-handling-reference)
7. [Next.js Implementation Guide](#7-nextjs-implementation-guide)
8. [Full User Journey Flows](#8-full-user-journey-flows)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                          │
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │  MetaMask /  │    │  Auth Store  │    │   RWA Note Pages     │  │
│  │ WalletConnect│    │ (accessToken │    │  (list, view, edit)  │  │
│  └──────┬───────┘    │  refreshToken│    └──────────┬───────────┘  │
│         │            └──────┬───────┘               │              │
└─────────┼───────────────────┼───────────────────────┼──────────────┘
          │ sign message       │ Bearer token          │ GET (public)
          ▼                    ▼                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  RWA Note API (Cloud Run)                           │
│                                                                     │
│  POST /auth/nonce    ← get nonce (no auth needed)                  │
│  POST /auth/login    ← verify SIWE signature → JWT                 │
│  POST /auth/refresh  ← exchange refresh token → new access token   │
│                                                                     │
│  GET    /:network/rwa-notes              (public)                  │
│  GET    /:network/rwa-notes/:id          (public)                  │
│  GET    /:network/rwa-notes/by-contract/:address  (public)         │
│  GET    /:network/rwa-notes/by-owner/:address     (public)         │
│  POST   /:network/rwa-notes              ← JWT required            │
│  PATCH  /:network/rwa-notes/:id          ← JWT required            │
│  DELETE /:network/rwa-notes/:id          ← JWT required            │
└─────────────────────────────────────────────────┬───────────────────┘
                                                   │ getContractRecord()
                                                   ▼
                                    ┌──────────────────────────┐
                                    │  SixRwaDisclosureContract│
                                    │  (on-chain verification) │
                                    └──────────────────────────┘
```

### Write Permission Rule
To **create / update / delete** a note, the caller must:
1. Hold a valid JWT (`Authorization: Bearer <accessToken>`)
2. The wallet in the JWT must be the same wallet that called `rwaNoteAuthentication()` on-chain (the `authenticatedBy` field from `getContractRecord()`)

---

## 2. Token Storage Strategy

| Token | Lifetime | Where to store |
|---|---|---|
| `accessToken` | 15 minutes | Memory / React state (never localStorage) |
| `refreshToken` | 7 days | `httpOnly` cookie OR `localStorage` (lower security) |

**Recommended for Next.js:**
- Store `accessToken` in memory (React context/Zustand store)
- Store `refreshToken` in `httpOnly` cookie via a Next.js API route
- Auto-refresh the `accessToken` before it expires using a silent refresh

---

## 3. Complete Auth Flow (SIWE Login)

```
Frontend                          API Server                    Blockchain (RPC)
   │                                   │                               │
   │  1. User clicks "Connect Wallet"  │                               │
   │  MetaMask connects → walletAddress│                               │
   │                                   │                               │
   │  2. GET /auth/nonce?address=0x... │                               │
   │ ────────────────────────────────► │                               │
   │ ◄──────────────────────────────── │                               │
   │  { nonce: "a3f9c2e1b7d04568",     │                               │
   │    walletAddress: "0x...",         │                               │
   │    expiresAt: 1709900300 }         │                               │
   │                                   │                               │
   │  3. Build SIWE message (EIP-4361) │                               │
   │  4. MetaMask: personal_sign(msg)  │                               │
   │     → signature: "0xabc123..."    │                               │
   │                                   │                               │
   │  5. POST /auth/login              │                               │
   │     { walletAddress,              │                               │
   │       message, signature }        │                               │
   │ ────────────────────────────────► │                               │
   │                                   │  verify signature (ethers.js) │
   │                                   │  consume nonce (one-time use) │
   │ ◄──────────────────────────────── │                               │
   │  { accessToken, refreshToken,     │                               │
   │    expiresIn: 900 }               │                               │
   │                                   │                               │
   │  6. Store tokens                  │                               │
   │  7. Call write APIs with          │                               │
   │     Authorization: Bearer <token> │                               │
   │ ────────────────────────────────► │                               │
   │                                   │  JWT.walletAddress            │
   │                                   │  == getContractRecord()       │
   │                                   │     .authenticatedBy  ───────►│
   │                                   │                         (RPC) │
   │ ◄──────────────────────────────── │                               │
   │  201 Created / 200 OK             │                               │
```

---

## 4. API Reference — Auth Endpoints

### 4.1 `GET /auth/nonce`

Get a one-time nonce. Must be embedded in the SIWE message before signing.

**Request**
```
GET /auth/nonce?address=0x742d35Cc6634C0532925a3b8D4031d6965489cC6
```

**Response `200`**
```json
{
  "nonce": "a3f9c2e1b7d04568",
  "walletAddress": "0x742d35Cc6634C0532925a3b8D4031d6965489cC6",
  "expiresAt": 1709900300
}
```

| Field | Type | Description |
|---|---|---|
| `nonce` | `string` | 16-char hex string — embed into SIWE message |
| `walletAddress` | `string` | Echo of the address you passed |
| `expiresAt` | `number` | Unix timestamp (seconds) — nonce expires after 5 min |

---

### 4.2 `POST /auth/login`

Verify SIWE signature and receive JWT tokens.

**Request Body**
```json
{
  "walletAddress": "0x742d35Cc6634C0532925a3b8D4031d6965489cC6",
  "message": "sixscan.six.network wants you to sign in with your Ethereum account:\n0x742d35Cc6634C0532925a3b8D4031d6965489cC6\n\nSign in to SixScan RWA Note API\n\nURI: https://sixscan.six.network\nVersion: 1\nChain ID: 1\nNonce: a3f9c2e1b7d04568\nIssued At: 2026-03-06T08:00:00.000Z",
  "signature": "0xabc123..."
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `walletAddress` | `string` | ✅ | EVM address (EIP-55 checksum or lowercase) |
| `message` | `string` | ✅ | The full EIP-4361 SIWE message that was signed |
| `signature` | `string` | ✅ | Hex signature from `personal_sign` |

**Response `200`**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900
}
```

| Field | Type | Description |
|---|---|---|
| `accessToken` | `string` | Use as `Authorization: Bearer <token>` header |
| `refreshToken` | `string` | Use to get a new access token when it expires |
| `expiresIn` | `number` | Access token lifetime in **seconds** (900 = 15 min) |

---

### 4.3 `POST /auth/refresh`

Exchange a refresh token for a new access token (silent refresh).

**Request Body**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response `200`** — same shape as login:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900
}
```

---

## 5. API Reference — RWA Note Endpoints

> **Network param:** Replace `:network` with `sixnet` or `fivenet`  
> **🔓 Public** = no auth needed  
> **🔒 JWT** = `Authorization: Bearer <accessToken>` required

---

### 5.1 `GET /:network/rwa-notes` 🔓

List all RWA notes with pagination.

**Request**
```
GET /sixnet/rwa-notes?page=1&limit=20
```

| Query Param | Type | Default | Min | Max | Description |
|---|---|---|---|---|---|
| `page` | `number` | `1` | `1` | — | Page number (1-based) |
| `limit` | `number` | `20` | `1` | `100` | Items per page |

**Response `200`**
```json
{
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "contractAddress": "0x742d35Cc6634C0532925a3b8D4031d6965489cC6",
      "contractOwnerAddress": "0xAbCd1234...",
      "note": "RWA contract for tokenised real estate in Bangkok.",
      "createdAt": "2026-03-01T10:00:00.000Z",
      "updatedAt": "2026-03-05T14:30:00.000Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

| Field | Type | Description |
|---|---|---|
| `data` | `RwaNoteResponse[]` | Array of notes for this page |
| `total` | `number` | Total number of notes in DB |
| `page` | `number` | Current page |
| `limit` | `number` | Items per page |

---

### 5.2 `GET /:network/rwa-notes/by-contract/:contractAddress` 🔓

Get a single note by the RWA contract address. Returns the note written for that contract.

**Request**
```
GET /sixnet/rwa-notes/by-contract/0x742d35Cc6634C0532925a3b8D4031d6965489cC6
```

**Response `200`** — single `RwaNoteResponse` object (see shape below)

---

### 5.3 `GET /:network/rwa-notes/by-owner/:ownerAddress` 🔓

Get all notes whose `contractOwnerAddress` matches. One owner can own multiple RWA contracts.

**Request**
```
GET /sixnet/rwa-notes/by-owner/0xAbCd1234...
```

**Response `200`** — array of `RwaNoteResponse` objects

---

### 5.4 `GET /:network/rwa-notes/:id` 🔓

Get a single note by MongoDB document ID.

**Request**
```
GET /sixnet/rwa-notes/507f1f77bcf86cd799439011
```

**Response `200`** — single `RwaNoteResponse` object

---

### 5.5 `POST /:network/rwa-notes` 🔒

Create a new RWA note. The `contractAddress` must already be authenticated on-chain and the JWT wallet must be the `authenticatedBy` address.

**Headers**
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body**
```json
{
  "contractAddress": "0x742d35Cc6634C0532925a3b8D4031d6965489cC6",
  "contractOwnerAddress": "0xAbCd1234...",
  "note": "This RWA contract represents tokenised real estate at 123 Main St, Bangkok."
}
```

| Field | Type | Required | Validation | Description |
|---|---|---|---|---|
| `contractAddress` | `string` | ✅ | EVM address | The RWA smart contract address |
| `contractOwnerAddress` | `string` | ✅ | EVM address | The owner's wallet address |
| `note` | `string` | ✅ | max 1000 chars | Note content |

**Response `201`** — `RwaNoteResponse` object

---

### 5.6 `PATCH /:network/rwa-notes/:id` 🔒

Update the note text. Only the `note` field can be changed (not `contractAddress` or `contractOwnerAddress`).

**Headers**
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body**
```json
{
  "note": "Updated note content."
}
```

| Field | Type | Required | Validation | Description |
|---|---|---|---|---|
| `note` | `string` | ✅ | max 1000 chars | New note content |

> ⚠️ Do **not** send extra fields — `forbidNonWhitelisted: true` will return `400`.

**Response `200`** — updated `RwaNoteResponse` object

---

### 5.7 `DELETE /:network/rwa-notes/:id` 🔒

Delete a note permanently.

**Headers**
```
Authorization: Bearer <accessToken>
```

**Response `204 No Content`** — empty body

---

### RwaNoteResponse — Shared Object Shape

```typescript
interface RwaNoteResponse {
  id: string;                    // MongoDB ObjectId as string
  contractAddress: string;       // EVM address of the RWA contract
  contractOwnerAddress: string;  // EVM address of the contract owner
  note: string;                  // Note text (max 1000 chars)
  createdAt: string;             // ISO 8601 datetime
  updatedAt: string;             // ISO 8601 datetime
}
```

---

## 6. Error Handling Reference

All errors follow this shape:

```typescript
interface ApiError {
  statusCode: number;
  message: string | string[] | object;  // string[] for validation errors
  path: string;
  timestamp: string;   // ISO 8601
  requestId: string;
}
```

**Example — validation error (400)**
```json
{
  "statusCode": 400,
  "message": [
    "contractAddress must be an Ethereum address",
    "note should not be empty"
  ],
  "path": "/sixnet/rwa-notes",
  "timestamp": "2026-03-06T08:00:00.000Z",
  "requestId": "abc-123"
}
```

**Status Code Quick Reference**

| Code | When | Common cause |
|---|---|---|
| `200` | GET / PATCH success | — |
| `201` | POST success | Note created |
| `204` | DELETE success | Empty body — don't try to parse |
| `400` | Bad request | Invalid address, missing field, extra field in body, invalid SIWE message |
| `401` | Unauthorized | Missing/expired/invalid JWT, bad signature, replayed nonce |
| `403` | Forbidden | JWT wallet ≠ `authenticatedBy` on-chain, contract not authenticated |
| `404` | Not found | Note with that ID / address doesn't exist |
| `409` | Conflict | Note for this `contractAddress` already exists (one note per contract) |
| `500` | Server error | Internal error |
| `503` | Service unavailable | DB not ready (startup / shutdown) |

---

## 7. Next.js Implementation Guide

### 7.1 Install Dependencies

```bash
npm install siwe ethers viem @wagmi/core
# or with wagmi + viem (recommended for Next.js)
npm install wagmi viem siwe @tanstack/react-query
```

---

### 7.2 API Client (`lib/api.ts`)

```typescript
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://evm-sixscan-rwa-note-api-4ze6p6t2ga-as.a.run.app';

export type Network = 'sixnet' | 'fivenet';

// ── Token store (in-memory — replace with your state manager) ──────────────
let _accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  _accessToken = token;
}

function authHeaders(): HeadersInit {
  return _accessToken
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${_accessToken}` }
    : { 'Content-Type': 'application/json' };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const data = await res.json();
  if (!res.ok) throw data; // data is ApiError shape
  return data as T;
}

// ── Auth ──────────────────────────────────────────────────────────────────

export async function getNonce(address: string) {
  const res = await fetch(`${BASE_URL}/auth/nonce?address=${address}`);
  return handleResponse<{ nonce: string; walletAddress: string; expiresAt: number }>(res);
}

export async function login(body: { walletAddress: string; message: string; signature: string }) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<{ accessToken: string; refreshToken: string; expiresIn: number }>(res);
}

export async function refreshTokens(refreshToken: string) {
  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  return handleResponse<{ accessToken: string; refreshToken: string; expiresIn: number }>(res);
}

// ── RWA Notes ─────────────────────────────────────────────────────────────

export async function listNotes(network: Network, page = 1, limit = 20) {
  const res = await fetch(`${BASE_URL}/${network}/rwa-notes?page=${page}&limit=${limit}`);
  return handleResponse<{ data: RwaNoteResponse[]; total: number; page: number; limit: number }>(res);
}

export async function getNoteById(network: Network, id: string) {
  const res = await fetch(`${BASE_URL}/${network}/rwa-notes/${id}`);
  return handleResponse<RwaNoteResponse>(res);
}

export async function getNoteByContract(network: Network, contractAddress: string) {
  const res = await fetch(`${BASE_URL}/${network}/rwa-notes/by-contract/${contractAddress}`);
  return handleResponse<RwaNoteResponse>(res);
}

export async function getNotesByOwner(network: Network, ownerAddress: string) {
  const res = await fetch(`${BASE_URL}/${network}/rwa-notes/by-owner/${ownerAddress}`);
  return handleResponse<RwaNoteResponse[]>(res);
}

export async function createNote(network: Network, body: CreateNoteBody) {
  const res = await fetch(`${BASE_URL}/${network}/rwa-notes`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return handleResponse<RwaNoteResponse>(res);
}

export async function updateNote(network: Network, id: string, note: string) {
  const res = await fetch(`${BASE_URL}/${network}/rwa-notes/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ note }),
  });
  return handleResponse<RwaNoteResponse>(res);
}

export async function deleteNote(network: Network, id: string) {
  const res = await fetch(`${BASE_URL}/${network}/rwa-notes/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse<void>(res);
}

// ── Types ─────────────────────────────────────────────────────────────────

export interface RwaNoteResponse {
  id: string;
  contractAddress: string;
  contractOwnerAddress: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteBody {
  contractAddress: string;
  contractOwnerAddress: string;
  note: string;
}
```

---

### 7.3 SIWE Login Hook (`hooks/useWalletLogin.ts`)

```typescript
'use client';

import { useState } from 'react';
import { SiweMessage } from 'siwe';
import { useAccount, useSignMessage } from 'wagmi';
import { getNonce, login, setAccessToken } from '@/lib/api';

export function useWalletLogin() {
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    if (!address) throw new Error('Wallet not connected');
    setLoading(true);
    setError(null);

    try {
      // Step 1: Get nonce from API
      const { nonce } = await getNonce(address);

      // Step 2: Build SIWE message
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: 'Sign in to SixScan RWA Note API',
        uri: window.location.origin,
        version: '1',
        chainId: chainId ?? 1,
        nonce,
      });
      const preparedMessage = message.prepareMessage();

      // Step 3: Sign with MetaMask / WalletConnect
      const signature = await signMessageAsync({ message: preparedMessage });

      // Step 4: Verify on server and get JWT
      const tokens = await login({
        walletAddress: address,
        message: preparedMessage,
        signature,
      });

      // Step 5: Store tokens
      setAccessToken(tokens.accessToken);
      // Store refreshToken in httpOnly cookie via your Next.js API route, or:
      localStorage.setItem('refreshToken', tokens.refreshToken);

      // Step 6: Schedule silent refresh before expiry (1 min before)
      setTimeout(() => silentRefresh(), (tokens.expiresIn - 60) * 1000);

      return tokens;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const silentRefresh = async () => {
    const storedRefresh = localStorage.getItem('refreshToken');
    if (!storedRefresh) return;
    try {
      const tokens = await import('@/lib/api').then(m => m.refreshTokens(storedRefresh));
      setAccessToken(tokens.accessToken);
      localStorage.setItem('refreshToken', tokens.refreshToken);
      setTimeout(() => silentRefresh(), (tokens.expiresIn - 60) * 1000);
    } catch {
      setAccessToken(null);
      localStorage.removeItem('refreshToken');
    }
  };

  const signOut = () => {
    setAccessToken(null);
    localStorage.removeItem('refreshToken');
  };

  return { signIn, signOut, silentRefresh, loading, error };
}
```

---

### 7.4 Environment Variables (`.env.local`)

```bash
NEXT_PUBLIC_API_URL=https://evm-sixscan-rwa-note-api-4ze6p6t2ga-as.a.run.app
NEXT_PUBLIC_DEFAULT_NETWORK=sixnet
```

---

### 7.5 Error Handler Utility (`lib/apiError.ts`)

```typescript
export interface ApiError {
  statusCode: number;
  message: string | string[];
  path: string;
  timestamp: string;
  requestId: string;
}

export function isApiError(err: unknown): err is ApiError {
  return typeof err === 'object' && err !== null && 'statusCode' in err;
}

export function getErrorMessage(err: unknown): string {
  if (isApiError(err)) {
    if (Array.isArray(err.message)) return err.message.join(', ');
    return String(err.message);
  }
  if (err instanceof Error) return err.message;
  return 'An unexpected error occurred';
}

// Usage in component:
// try { await createNote(...) }
// catch (err) { toast.error(getErrorMessage(err)) }
```

---

## 8. Full User Journey Flows

### Flow A — Read-Only User (No Login Required)

```
User visits /sixnet page
    │
    ▼
listNotes('sixnet')
→ GET /sixnet/rwa-notes?page=1&limit=20
← { data: [...], total: 42, page: 1, limit: 20 }
    │
    ▼
User clicks on a contract address
→ GET /sixnet/rwa-notes/by-contract/0x...
← { id, contractAddress, note, ... }
```

---

### Flow B — Owner Writes a Note (Full Auth Flow)

```
1. User connects wallet (MetaMask)
   walletAddress = "0xOwner..."

2. User already paid fee on-chain:
   contract.rwaNoteAuthentication(rwaContractAddress, { value: feeAmount })
   → authenticatedBy = "0xOwner..."

3. GET /auth/nonce?address=0xOwner...
   ← { nonce: "abc123", expiresAt: ... }

4. Build & sign SIWE message with MetaMask

5. POST /auth/login { walletAddress, message, signature }
   ← { accessToken, refreshToken, expiresIn: 900 }

6. POST /sixnet/rwa-notes
   Authorization: Bearer <accessToken>
   { contractAddress: "0xRWAContract...",
     contractOwnerAddress: "0xOwner...",
     note: "This is a tokenised property at..." }
   
   Server checks:
   ✅ JWT valid → walletAddress = "0xOwner..."
   ✅ getContractRecord("0xRWAContract...").isAuthenticated == true
   ✅ getContractRecord("0xRWAContract...").authenticatedBy == "0xOwner..."
   
   ← 201 { id, contractAddress, note, createdAt, updatedAt }
```

---

### Flow C — Owner Updates Their Note

```
1. Tokens already in memory from previous login

2. PATCH /sixnet/rwa-notes/507f1f77bcf86cd799439011
   Authorization: Bearer <accessToken>
   { "note": "Updated note text." }
   
   Server fetches existing note → gets contractAddress
   Runs same on-chain check as CREATE
   
   ← 200 { id, contractAddress, note: "Updated note text.", updatedAt }
```

---

### Flow D — Token Expired Mid-Session

```
1. User tries to POST/PATCH/DELETE
   ← 401 { statusCode: 401, message: "JWT validation failed: jwt expired" }

2. Frontend catches 401
   → POST /auth/refresh { refreshToken }
   ← { accessToken, refreshToken, expiresIn: 900 }

3. Store new accessToken

4. Retry the original request
   ← 201 / 200 success
```

**Recommended 401 interceptor pattern:**
```typescript
// In your api.ts fetch wrapper:
async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  let res = await fetch(url, options);

  if (res.status === 401) {
    const storedRefresh = localStorage.getItem('refreshToken');
    if (storedRefresh) {
      try {
        const tokens = await refreshTokens(storedRefresh);
        setAccessToken(tokens.accessToken);
        localStorage.setItem('refreshToken', tokens.refreshToken);

        // Retry with new token
        const retryOptions = {
          ...options,
          headers: { ...options.headers, Authorization: `Bearer ${tokens.accessToken}` },
        };
        res = await fetch(url, retryOptions);
      } catch {
        // Refresh failed → force logout
        setAccessToken(null);
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
      }
    }
  }
  return res;
}
```

---

### Flow E — Owner Deletes a Note

```
1. DELETE /sixnet/rwa-notes/507f1f77bcf86cd799439011
   Authorization: Bearer <accessToken>
   
   ← 204 No Content (empty body — do NOT call res.json())
```

> **Important:** `204` responses have no body. Always check the status code before calling `.json()`.

---

## Quick Reference Card

```
BASE URL: https://evm-sixscan-rwa-note-api-4ze6p6t2ga-as.a.run.app
NETWORK:  sixnet | fivenet

─── AUTH (no JWT needed) ────────────────────────────────────────────────────
GET  /auth/nonce?address=<wallet>    → { nonce, walletAddress, expiresAt }
POST /auth/login                     → { accessToken, refreshToken, expiresIn }
POST /auth/refresh                   → { accessToken, refreshToken, expiresIn }

─── READ (public, no JWT) ───────────────────────────────────────────────────
GET  /:network/rwa-notes                            → paginated list
GET  /:network/rwa-notes/:id                        → single note
GET  /:network/rwa-notes/by-contract/:address       → single note
GET  /:network/rwa-notes/by-owner/:address          → array of notes

─── WRITE (🔒 Authorization: Bearer <accessToken>) ──────────────────────────
POST   /:network/rwa-notes                → 201 + note object
PATCH  /:network/rwa-notes/:id            → 200 + updated note object
DELETE /:network/rwa-notes/:id            → 204 empty body

─── HEALTH (public) ─────────────────────────────────────────────────────────
GET  /health/live                          → { status: "alive", timestamp }
GET  /health/ready                         → { status: "ready", networks: {...} }
```
