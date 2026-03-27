import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${process.env.API_URL || 'http://api:3000'}/api/:path*` },
      { source: '/health', destination: `${process.env.API_URL || 'http://api:3000'}/health` },
      { source: '/admin/:path*', destination: `${process.env.API_URL || 'http://api:3000'}/admin/:path*` },

    ];
  },
  async redirects() {
    return [
      { source: '/equipment', destination: '/components', permanent: true },
      { source: '/items', destination: '/fps-gear', permanent: true },
      { source: '/commodities', destination: '/industrial', permanent: true },
    ];
  },
};

export default nextConfig;
