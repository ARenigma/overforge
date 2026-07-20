/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    forceSwcTransforms: true,
    esmExternals: false,
    // Tree-shake heavy barrel imports so dev doesn't compile the entire set
    // (react-icons ships ~3k icons; importing a few should not bundle them all).
    optimizePackageImports: ['react-icons', 'react-icons/si'],
    // Enable the instrumentation.ts hook (Next.js 14.0.x — became stable in 14.1).
    // Required for Sentry initialisation via register(); harmless when DSN is unset.
    instrumentationHook: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          }
        ],
      },
    ];
  },
}

export default nextConfig
