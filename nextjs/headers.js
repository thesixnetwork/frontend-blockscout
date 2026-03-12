async function headers() {
  return [
    {
      source: '/:path*',
      headers: [
        // security headers from here - https://nextjs.org/docs/advanced-features/security-headers
        {
          key: 'X-Frame-Options',
          value: 'SAMEORIGIN',
        },
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        {
          key: 'X-XSS-Protection',
          value: '1; mode=block',
        },
        {
          key: 'X-DNS-Prefetch-Control',
          value: 'on',
        },
        {
          key: 'Cross-Origin-Opener-Policy',
          // 'same-origin' breaks Coinbase Smart Wallet popup communication.
          // 'same-origin-allow-popups' preserves security while allowing wallet popups.
          value: 'same-origin-allow-popups',
        },
        {
          key: 'Referrer-Policy',
          value: 'origin-when-cross-origin',
        },
      ],
    },
  ];
}

module.exports = headers;
