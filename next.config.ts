import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['bullmq', 'mongoose', 'ioredis'],
  // Gera bundle standalone para runtime enxuto no Docker
  output: 'standalone',
  // Desabilita sourcemaps de produção para não expor código
  productionBrowserSourceMaps: false,
  // Remove o header X-Powered-By padrão
  poweredByHeader: false,
  // Segurança de cabeçalhos HTTP
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy', value:
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://*.shopify.com; font-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          { key: 'X-Powered-By', value: '' },
        ],
      },
    ];
  },
};

export default nextConfig;
