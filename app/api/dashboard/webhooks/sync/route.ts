import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAuth } from '@/lib/auth/dashboard';
import { runWebhookSync } from '@/lib/services/webhooksManager';

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth(req);
  if (auth) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const platforms = body.platforms ?? ['shopify', 'woocommerce'];
    const force = body.force === true;

    const { hasError, domain, results } = await runWebhookSync(platforms, force);

    return NextResponse.json({ domain, results, force }, { status: hasError ? 207 : 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
