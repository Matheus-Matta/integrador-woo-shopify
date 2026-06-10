import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    namespace: 'jwt-auth/v1',
    routes: {
      '/wp-json/jwt-auth/v1/token': { methods: ['POST'] },
    },
  });
}
