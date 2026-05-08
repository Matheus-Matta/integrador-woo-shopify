import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAuth } from '@/lib/auth/dashboard';
import { getAllWebhooksStatus } from '@/lib/services/webhooksManager';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth(req);
  if (auth) return auth;

  try {
    const status = await getAllWebhooksStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
