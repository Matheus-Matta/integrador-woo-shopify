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
            "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; connect-src 'self' https://*.shopify.com ws: wss:; font-src 'self' https://fonts.gstatic.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          { key: 'X-Powered-By', value: '' },
        ],
      },
    ];
  },
  // Rewrites para rotas legadas de webhooks → preserva método/body
  async rewrites() {
    return [
      // WooCommerce (legadas → novas)
      { source: '/webhook/woo-product', destination: '/api/webhooks/woo/products' },
      { source: '/webhook/woo-order-update', destination: '/api/webhooks/woo/orders/update' },

      // Shopify (legadas → novas)
      { source: '/webhook/shop-order-create', destination: '/api/webhooks/shopify/orders/create' },
      { source: '/webhook/shop-order-update', destination: '/api/webhooks/shopify/orders/update' },
      { source: '/webhook/shop-customer-create', destination: '/api/webhooks/shopify/customers/create' },
      { source: '/webhook/shop-customer-update', destination: '/api/webhooks/shopify/customers/update' },
    ];
  },
};

export default nextConfig;
