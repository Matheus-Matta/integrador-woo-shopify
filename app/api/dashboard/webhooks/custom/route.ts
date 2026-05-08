import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAuth } from '@/lib/auth/dashboard';
import { createShopifyWebhook, createWooWebhook } from '@/lib/services/webhooksManager';

export async function POST(request: NextRequest) {
  const auth = await requireDashboardAuth(request);
  if (auth) return auth;

  try {
    const body = await request.json();
    const { platform, topic, url } = body;

    if (!platform || !topic || !url) {
      return NextResponse.json({ error: 'Campos platform, topic e url são obrigatórios.' }, { status: 400 });
    }

    let id;
    if (platform === 'shopify') {
      id = await createShopifyWebhook(topic, url);
    } else if (platform === 'woocommerce') {
      id = await createWooWebhook(topic, url);
    } else {
      return NextResponse.json({ error: 'Plataforma inválida.' }, { status: 400 });
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
