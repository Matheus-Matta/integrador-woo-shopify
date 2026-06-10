import { NextResponse } from 'next/server';

export async function GET() {
  const base = (process.env.DOMAIN || process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || '').replace(/\/$/, '');

  return NextResponse.json({
    name: 'WooCommerce Compatible API',
    description: 'API propria compativel com WooCommerce REST API.',
    url: base,
    namespaces: ['wc/v3', 'jwt-auth/v1'],
    routes: {
      '/wp-json/wc/v3': { namespace: 'wc/v3' },
      '/wp-json/jwt-auth/v1': { namespace: 'jwt-auth/v1' },
      '/wp-json/jwt-auth/v1/token': { methods: ['POST'] },
      '/wp-json/wc/v3/products': { methods: ['GET', 'POST'] },
      '/wp-json/wc/v3/customers': { methods: ['GET', 'POST'] },
      '/wp-json/wc/v3/orders': { methods: ['GET', 'POST'] },
      '/wp-json/wc/v3/products/(?P<id>[\\d]+)': { methods: ['GET', 'PUT', 'PATCH', 'DELETE'] },
    },
  });
}
