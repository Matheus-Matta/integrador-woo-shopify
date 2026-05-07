import { NextRequest, NextResponse } from 'next/server';
import { verifyShopifyHmac } from '@/lib/utils/webhook-validator';
import { ordersQueue } from '@/lib/queue/queues';
import { logError } from '@/lib/services/logger';
import { s, hasServices } from '@/lib/utils/helpers';
import { deduplicateDelivery, deduplicateOrder } from '@/lib/services/webhookDedup';

export async function GET(req: NextRequest) {
  if (!req.cookies.get('dash_token')?.value) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.json({
    active: true,
    webhook: 'shop-order-update',
    route: '/api/webhooks/shopify/orders/update',
    method: 'POST',
    description: 'Recebe notificações de atualização de pedido do Shopify',
  });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  console.log(`[shop-order-update] 📥 POST recebido — IP: ${ip}`);

  try {
    const rawBody = await req.text();
    const sig = req.headers.get('x-shopify-hmac-sha256') || '';

    if (!verifyShopifyHmac(rawBody, sig)) {
      console.warn(`[shop-order-update] ⚠️ HMAC inválido — rejeitado IP: ${ip}`);
      void logError({ flow: 'shop-order-update', error_message: 'HMAC inválido', payload: { sig: sig ?? '(vazio)', ip } });
      return NextResponse.json({ error: 'Assinatura invalida' }, { status: 401 });
    }

    const deliveryId = req.headers.get('x-shopify-delivery-id');
    if (deliveryId) {
      const isNew = await deduplicateDelivery(deliveryId);
      if (!isNew) {
        console.warn(`[shop-order-update] ⏭️ delivery duplicado — descartado: ${deliveryId}`);
        return NextResponse.json({ skipped: true, reason: 'duplicate-delivery' });
      }
    }

    const order = JSON.parse(rawBody || '{}');
    const shopifyOrderId = String(order?.id ?? '');

    if (!shopifyOrderId) {
      console.warn(`[shop-order-update] ❌ campo obrigatório ausente — orderId`);
      return NextResponse.json({ error: 'id do pedido é obrigatorio' }, { status: 400 });
    }

    if (!hasServices(order)) {
      console.warn(`[shop-order-update] ⏭️ pedido sem serviços — descartado: ${shopifyOrderId}`);
      return NextResponse.json({ skipped: true, reason: 'no-services' });
    }

    const isNewOrder = await deduplicateOrder('shop-order-update', shopifyOrderId);
    if (!isNewOrder) {
      console.warn(`[shop-order-update] ⏭️ order duplicado (30s) — descartado: ${shopifyOrderId}`);
      return NextResponse.json({ skipped: true, reason: 'duplicate-order' });
    }

    const job = await ordersQueue.add('shop-order-update', order);
    console.info(`[shop-order-update] ✅ enfileirado — jobId=${job.id} shopifyOrderId=${shopifyOrderId}`);
    return NextResponse.json({ queued: true, jobId: job.id, shopifyOrderId }, { status: 202 });
  } catch (err) {
    console.error(`[shop-order-update] 💥 erro interno — IP: ${ip}`, err);
    return NextResponse.json({ error: 'Erro interno ao enfileirar job', detail: (err as Error).message }, { status: 500 });
  }
}
