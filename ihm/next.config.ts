import type { NextConfig } from 'next';

const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const BACKEND_API_URL = (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  async headers() {
    return [{ source: '/(.*)', headers: SECURITY_HEADERS }];
  },
  async rewrites() {
    return [
      { source: '/api/v2/:path*', destination: `${BACKEND_API_URL}/api/v2/:path*` },
      { source: '/api-docs', destination: `${BACKEND_API_URL}/api-docs/` },
      { source: '/api-docs/:path*', destination: `${BACKEND_API_URL}/api-docs/:path*` },
      { source: '/admin/api-docs', destination: `${BACKEND_API_URL}/admin/api-docs` },
      { source: '/admin/api-docs/:path*', destination: `${BACKEND_API_URL}/admin/api-docs/:path*` },
      { source: '/health/:path*', destination: `${BACKEND_API_URL}/health/:path*` },
      { source: '/health', destination: `${BACKEND_API_URL}/health/live` },
    ];
  },
  async redirects() {
    return [
      { source: '/equipment', destination: '/components', permanent: true },
      { source: '/ships-components', destination: '/components', permanent: true },
      { source: '/vehicles', destination: '/ships', permanent: true },
      { source: '/outfitter', destination: '/ships', permanent: true },
      { source: '/blueprints', destination: '/items', permanent: true },
      { source: '/mining', destination: '/commodities', permanent: true },
      { source: '/trade', destination: '/commodities', permanent: true },
      { source: '/industrial', destination: '/commodities', permanent: true },
      { source: '/minerals', destination: '/commodities', permanent: true },
      { source: '/other-items', destination: '/items', permanent: true },
      { source: '/consumables', destination: '/items', permanent: true },
      { source: '/compare', destination: '/ships', permanent: true },
      { source: '/ranking', destination: '/ships', permanent: true },
      { source: '/fps-calculator', destination: '/items', permanent: true },
      { source: '/trade-calculator', destination: '/commodities', permanent: true },
      { source: '/mining-calculator', destination: '/commodities', permanent: true },
      { source: '/crafting-calculator', destination: '/items', permanent: true },
      { source: '/crafting', destination: '/items', permanent: true },
    ];
  },
};

export default nextConfig;
