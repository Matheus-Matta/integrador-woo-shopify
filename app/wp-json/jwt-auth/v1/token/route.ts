import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';

function safeEqual(input: string, expected: string) {
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function jwtError(code: string, message: string, status: number) {
  return NextResponse.json({ code, message, data: { status } }, { status });
}

export async function POST(req: NextRequest) {
  const secret = process.env.JWT_SECRET;
  const expectedUser = process.env.WOO_API_JWT_USER;
  const expectedPassword = process.env.WOO_API_JWT_PASSWORD;
  const expiresIn = process.env.WOO_API_JWT_EXPIRES_IN || '8h';

  if (!secret || !expectedUser || !expectedPassword) {
    return jwtError(
      'jwt_auth_not_configured',
      'JWT API authentication is not configured.',
      500
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jwtError('jwt_auth_bad_request', 'Invalid JSON body.', 400);
  }

  const username = String(body.username || body.user || '');
  const password = String(body.password || body.pass || '');

  if (!safeEqual(username, expectedUser) || !safeEqual(password, expectedPassword)) {
    return jwtError('jwt_auth_failed', 'Invalid username or password.', 403);
  }

  const signOptions: SignOptions = {
    expiresIn: expiresIn as SignOptions['expiresIn'],
  };

  const token = jwt.sign(
    {
      sub: 'woo-api',
      username,
      scope: 'read_write',
    },
    secret,
    signOptions
  );

  return NextResponse.json({
    token,
    token_type: 'Bearer',
    expires_in: expiresIn,
    user_email: '',
    user_nicename: username,
    user_display_name: username,
  });
}
