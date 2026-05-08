import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '@/lib/config';

function safeSecretEquals(input: string, expected: string): boolean {
  const inputHash = crypto.createHash('sha256').update(input).digest();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(inputHash, expectedHash);
}

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();

    if (typeof password !== 'string' || !safeSecretEquals(password, config.dashboard.password)) {
      return NextResponse.json({ error: 'Senha incorreta' }, { status: 401 });
    }

    const jti = crypto.randomUUID();
    const token = jwt.sign(
      { sub: 'dashboard', jti },
      config.dashboard.jwtSecret,
      { expiresIn: '8h' }
    );

    const response = NextResponse.json({ ok: true });
    
    response.cookies.set('dash_token', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 8 * 60 * 60,
    });

    return response;
  } catch (error) {
    return NextResponse.json({ error: 'Erro no servidor' }, { status: 500 });
  }
}
