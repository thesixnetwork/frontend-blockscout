import type { NextApiRequest, NextApiResponse } from 'next';

const RWA_NOTE_API_URL = process.env.NEXT_PUBLIC_RWA_BACKEND_API_URL || 'https://rwa-note-backend-fivenet-593361572149.asia-southeast1.run.app';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Add CORS headers to ensure the route is accessible
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { endpoint } = req.query;

  if (!endpoint || typeof endpoint !== 'string') {
    return res.status(400).json({
      error: 'Missing endpoint parameter',
      hint: 'This is the RWA Note API route. Expected query parameter: endpoint',
    });
  }

  try {
    const url = `${ RWA_NOTE_API_URL }${ endpoint }`;

    const options: RequestInit = {
      method: req.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    // Add body for POST and PATCH requests
    if ((req.method === 'POST' || req.method === 'PATCH') && req.body) {
      options.body = JSON.stringify(req.body);
    }

    const response = await fetch(url, options);

    // Forward the status code
    res.status(response.status);

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
