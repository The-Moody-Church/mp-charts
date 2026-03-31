import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Required for Docker deployment
  cacheComponents: true, // Enables Cache Components (PPR + 'use cache' directive)
  serverActions: {
    bodySizeLimit: '20mb', // Match the 20 MB file upload limit in processing-utils.ts
  },
  cacheHandlers: {
    // Custom handler that properly supports stale-while-revalidate.
    // The default in-memory handler ignores cacheLife({ stale }) and expires
    // entries at revalidate time (6h), causing cold cache misses. This handler
    // serves stale data instantly while revalidating in the background.
    default: require.resolve('./cache-handler.js'),
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
