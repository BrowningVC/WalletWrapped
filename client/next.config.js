/** @type {import('next').NextConfig} */

// Production server URL - use custom domain API
const PRODUCTION_SERVER = 'https://api.walletwrapped.io';

const nextConfig = {
  reactStrictMode: true,

  // Environment variables exposed to browser
  env: {
    NEXT_PUBLIC_API_URL: process.env.NODE_ENV === 'production'
      ? PRODUCTION_SERVER
      : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'),
    NEXT_PUBLIC_SOCKET_URL: process.env.NODE_ENV === 'production'
      ? PRODUCTION_SERVER
      : (process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3002'),
  },

  // Image optimization
  images: {
    domains: ['localhost', 'walletwrapped.io', 'www.walletwrapped.io', 'api.walletwrapped.io'],
    formats: ['image/avif', 'image/webp'],
  },

  // Experimental features
  experimental: {
    optimizeCss: true,
  },

  // Headers for security and caching
  async headers() {
    return [
      {
        source: '/api/og',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
    ];
  },

  // Redirects
  async redirects() {
    return [];
  },
};

module.exports = nextConfig;
