import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

const sections = ['technology', 'products', 'nexcon', 'kronig', 'about', 'contact', 'privacy'];

const config: NextConfig = {
  turbopack: { root: fileURLToPath(new URL('.', import.meta.url)) },
  poweredByHeader: false,
  async redirects() {
    return [
      { source: '/index.html', destination: '/', permanent: true },
      ...sections.map(section => ({
        source: `/${section}.html`,
        destination: `/${section}`,
        permanent: true,
      })),
    ];
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    }];
  },
};

export default config;
