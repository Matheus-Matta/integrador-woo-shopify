import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    namespace: 'wc/v3',
    routes: {
      '/wp-json/wc/v3/products': { methods: ['GET', 'POST'] },
      '/wp-json/wc/v3/products/batch': { methods: ['POST'] },
      '/wp-json/wc/v3/customers': { methods: ['GET', 'POST'] },
      '/wp-json/wc/v3/customers/batch': { methods: ['POST'] },
      '/wp-json/wc/v3/orders': { methods: ['GET', 'POST'] },
      '/wp-json/wc/v3/orders/batch': { methods: ['POST'] },
      '/wp-json/wc/v3/products/categories': { methods: ['GET', 'POST'] },
      '/wp-json/wc/v3/products/tags': { methods: ['GET', 'POST'] },
      '/wp-json/wc/v3/products/attributes': { methods: ['GET', 'POST'] },
    },
    authentication: [
      'Bearer JWT from /wp-json/jwt-auth/v1/token',
      'consumer_key/consumer_secret query string',
      'Basic Auth',
    ],
  });
}
