import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      { source: '/api-docs', destination: `${process.env.API_URL || 'http://api:3000'}/api-docs` },
      { source: '/api-docs/:path*', destination: `${process.env.API_URL || 'http://api:3000'}/api-docs/:path*` },
      { source: '/api/:path*', destination: `${process.env.API_URL || 'http://api:3000'}/api/:path*` },
      { source: '/health/:path*', destination: `${process.env.API_URL || 'http://api:3000'}/health/:path*` },
      { source: '/health', destination: `${process.env.API_URL || 'http://api:3000'}/health/live` },
      { source: '/admin/:path*', destination: `${process.env.API_URL || 'http://api:3000'}/admin/:path*` },
    ];
  },
  async redirects() {
    return [
      { source: '/equipment', destination: '/components', permanent: true },
      { source: '/other-items', destination: '/consumables', permanent: true },
      { source: '/items', destination: '/consumables', permanent: true },
      { source: '/items/:uuid', destination: '/consumables/:uuid', permanent: true },
      { source: '/commodities', destination: '/industrial', permanent: true },
      { source: '/factions', destination: '/missions', permanent: true },
    ];
  },
};

export default nextConfig;
