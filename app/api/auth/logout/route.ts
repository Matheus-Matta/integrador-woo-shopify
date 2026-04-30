import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { denyJwt } from '@/lib/services/jwtDenylist';

interface JwtPayload {
  jti?: string;
  exp?: number;
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('dash_token')?.value;

    if (token) {
      const decoded = jwt.decode(token) as JwtPayload;
      if (decoded?.jti && decoded?.exp) {
        const ttlSeconds = decoded.exp - Math.floor(Date.now() / 1000);
        await denyJwt(decoded.jti, ttlSeconds);
      }
    }
  } catch (err) {
    console.error('Erro ao processar logout', err);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete('dash_token');

  return response;
}
