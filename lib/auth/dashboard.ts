import { NextRequest, NextResponse } from 'next/server';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { config } from '@/lib/config';
import { isJwtDenied } from '@/lib/services/jwtDenylist';

interface DashboardJwtPayload extends JwtPayload {
  sub?: string;
  jti?: string;
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
}

export async function requireDashboardAuth(req: NextRequest): Promise<NextResponse | null> {
  const token = req.cookies.get('dash_token')?.value;
  if (!token) return unauthorized();

  try {
    const decoded = jwt.verify(token, config.dashboard.jwtSecret) as DashboardJwtPayload;
    if (decoded.sub !== 'dashboard' || !decoded.jti) return unauthorized();
    if (await isJwtDenied(decoded.jti)) return unauthorized();
    return null;
  } catch {
    return unauthorized();
  }
}

