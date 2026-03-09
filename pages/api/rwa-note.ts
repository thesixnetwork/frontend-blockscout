import type { NextApiRequest, NextApiResponse } from 'next';

// Strip trailing /api suffix if the env value was set with it (backward compat)
function getBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_RWA_BACKEND_API_URL ?? 'https://evm-sixscan-rwa-note-api-4ze6p6t2ga-as.a.run.app';
  return raw.replace(/\/api\/?$/, '').replace(/\/$/, '');
}

// Resolve network name server-side from NEXT_PUBLIC_NETWORK_ID env var
function getNetworkName(): 'sixnet' | 'fivenet' {
  const id = Number(process.env.NEXT_PUBLIC_NETWORK_ID ?? '98');
  if (id === 150) return 'fivenet';
  return 'sixnet';
}

const NETWORK_NAMES: ReadonlyArray<string> = [ 'sixnet', 'fivenet' ];

/**
 * Ensure the endpoint starts with /{network}/.
 * If the client already included the network prefix, pass it through unchanged.
 * If not (e.g. "/rwa-notes/..."), prepend the server-resolved network.
 */
function normalizeEndpoint(endpoint: string): string {
  const withoutLeadingSlash = endpoint.replace(/^\//, '');
  const firstSegment = withoutLeadingSlash.split('/')[0];
  if (NETWORK_NAMES.includes(firstSegment)) {
    return endpoint; // already has network prefix
  }
  return `/${ getNetworkName() }${ endpoint.startsWith('/') ? endpoint : `/${ endpoint }` }`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Add CORS headers to ensure the route is accessible
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { endpoint, method: methodOverride } = req.query;

  if (!endpoint || typeof endpoint !== 'string') {
    return res.status(400).json({
      error: 'Missing endpoint parameter',
      hint: 'This is the RWA Note API route. Expected query parameter: endpoint',
    });
  }

  try {
    const BASE_URL = getBaseUrl();
    const normalizedEndpoint = normalizeEndpoint(endpoint);
    const url = `${ BASE_URL }${ normalizedEndpoint }`;

    // ?method= query param is the source of truth for the upstream HTTP method.
    // This bypasses nginx/GCP load balancers that rewrite PATCH/DELETE/PUT → POST.
    // The client always sends the real method via ?method= and the body via POST.
    // Fallback to req.method only when no override is present (e.g. plain GET reads).
    const effectiveMethod = (
      typeof methodOverride === 'string' && methodOverride.length > 0
        ? methodOverride.toUpperCase()
        : req.method
    ) || 'GET';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Forward Authorization header (Bearer JWT) from the client if present
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const options: RequestInit = {
      method: effectiveMethod,
      headers,
    };

    // Add body for POST, PATCH, PUT requests
    if ((effectiveMethod === 'POST' || effectiveMethod === 'PATCH' || effectiveMethod === 'PUT') && req.body) {
      options.body = JSON.stringify(req.body);
    }

    const response = await fetch(url, options);

    // Handle 204 No Content (DELETE success) — no body to parse
    if (response.status === 204) {
      return res.status(204).end();
    }

    // Forward response headers
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    // Handle different response types
    if (response.ok) {
      const data = await response.json();
      return res.status(response.status).json(data);
    } else if (response.status === 404) {
      return res.status(404).json({ error: 'Not found' });
    } else {
      const text = await response.text();
      return res.status(response.status).send(text);
    }
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to proxy request',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};
