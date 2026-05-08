import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { config } from '@/lib/config';
import { denyJwt } from '@/lib/services/jwtDenylist';

interface JwtPayload {
  jti?: string;
  exp?: number;
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('dash_token')?.value;

    if (token) {
      const decoded = jwt.verify(token, config.dashboard.jwtSecret) as JwtPayload;
      if (decoded?.jti && decoded?.exp) {
        const ttlSeconds = decoded.exp - Math.floor(Date.now() / 1000);
        await denyJwt(decoded.jti, ttlSeconds);
      }
    }
  } catch (err) {
    console.error('Erro ao processar logout', err);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set('dash_token', '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });

  return response;
}
