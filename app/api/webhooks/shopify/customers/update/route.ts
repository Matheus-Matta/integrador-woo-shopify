import { NextRequest, NextResponse } from 'next/server';
import { verifyShopifyHmac } from '@/lib/utils/webhook-validator';
import { ordersQueue } from '@/lib/queue/queues';
import { logError } from '@/lib/services/logger';
import { deduplicateDelivery } from '@/lib/services/webhookDedup';

export async function GET(req: NextRequest) {
  if (!req.cookies.get('dash_token')?.value) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.json({
    active: true,
    webhook: 'shop-customer-update',
    route: '/api/webhooks/shopify/customers/update',
    method: 'POST',
    description: 'Recebe notificações de atualização de cliente do Shopify',
  });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  console.log(`[shop-customer-update] 📥 POST recebido — IP: ${ip}`);

  try {
    const rawBody = await req.text();
    const sig = req.headers.get('x-shopify-hmac-sha256') || '';

    if (!verifyShopifyHmac(rawBody, sig)) {
      console.warn(`[shop-customer-update] ⚠️ HMAC inválido — rejeitado IP: ${ip}`);
      void logError({ flow: 'shop-customer-update', error_message: 'HMAC inválido', payload: { sig: sig ?? '(vazio)', ip } });
      return NextResponse.json({ error: 'Assinatura invalida' }, { status: 401 });
    }

    const deliveryId = req.headers.get('x-shopify-delivery-id');
    if (deliveryId) {
      const isNew = await deduplicateDelivery(deliveryId);
      if (!isNew) {
        console.warn(`[shop-customer-update] ⏭️ delivery duplicado — descartado: ${deliveryId}`);
        return NextResponse.json({ skipped: true, reason: 'duplicate-delivery' });
      }
    }

    const data = JSON.parse(rawBody || '{}');

    if (!data?.email) {
      console.warn(`[shop-customer-update] ❌ campo obrigatório ausente — email`);
      return NextResponse.json({ error: 'email do cliente é obrigatorio' }, { status: 400 });
    }

    const job = await ordersQueue.add('shop-customer-update', data);
    console.info(`[shop-customer-update] ✅ enfileirado — jobId=${job.id} shopifyCustomerId=${data.id}`);
    return NextResponse.json({ queued: true, jobId: job.id, shopifyCustomerId: data.id }, { status: 202 });
  } catch (err) {
    console.error(`[shop-customer-update] 💥 erro interno — IP: ${ip}`, err);
    return NextResponse.json({ error: 'Erro interno ao enfileirar job', detail: (err as Error).message }, { status: 500 });
  }
}
