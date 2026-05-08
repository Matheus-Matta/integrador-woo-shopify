import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAuth } from '@/lib/auth/dashboard';
import { verifyShopifyHmac } from '@/lib/utils/webhook-validator';
import { ordersQueue } from '@/lib/queue/queues';
import { logError } from '@/lib/services/logger';
import { s, hasServices } from '@/lib/utils/helpers';
import { deduplicateDelivery, deduplicateOrder } from '@/lib/services/webhookDedup';

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth(req);
  if (auth) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.json({
    active: true,
    webhook: 'shop-order-create',
    route: '/api/webhooks/shopify/orders/create',
    method: 'POST',
    description: 'Recebe notificações de criação de pedido do Shopify',
  });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  console.log(`[shop-order-create] 📥 POST recebido — IP: ${ip}`);

  try {
    const rawBody = await req.text();
    const sig = req.headers.get('x-shopify-hmac-sha256') || '';

    if (!verifyShopifyHmac(rawBody, sig)) {
      console.warn(`[shop-order-create] ⚠️ HMAC inválido — rejeitado IP: ${ip}`);
      void logError({ flow: 'shop-order-create', error_message: 'HMAC inválido', payload: { sigPresent: Boolean(sig), sigLen: sig.length, ip } });
      return NextResponse.json({ error: 'Assinatura invalida' }, { status: 401 });
    }

    const deliveryId = req.headers.get('x-shopify-delivery-id');
    if (deliveryId) {
      const isNew = await deduplicateDelivery(deliveryId);
      if (!isNew) {
        console.warn(`[shop-order-create] ⏭️ delivery duplicado — descartado: ${deliveryId}`);
        return NextResponse.json({ skipped: true, reason: 'duplicate-delivery' });
      }
    }

    const order = JSON.parse(rawBody || '{}');
    const email = s(order?.contact_email ?? order?.email);
    const shopifyOrderId = String(order?.id ?? '');

    if (!email || !shopifyOrderId) {
      console.warn(`[shop-order-create] ❌ campos obrigatórios ausentes — email: ${!!email}, orderId: ${!!shopifyOrderId}`);
      return NextResponse.json({ error: 'email e id do pedido sao obrigatorios' }, { status: 400 });
    }

    // Removido check de hasServices para permitir importação total conforme pedido do usuário

    const isNewOrder = await deduplicateOrder('shop-order-create', shopifyOrderId);
    if (!isNewOrder) {
      console.warn(`[shop-order-create] ⏭️ order duplicado (30s) — descartado: ${shopifyOrderId}`);
      return NextResponse.json({ skipped: true, reason: 'duplicate-order' });
    }

    const job = await ordersQueue.add('shop-order-create', order, {
      jobId: `shop-order-create:${shopifyOrderId}`,
    });
    console.info(`[shop-order-create] ✅ enfileirado — jobId=${job.id} shopifyOrderId=${shopifyOrderId}`);
    return NextResponse.json({ queued: true, jobId: job.id, shopifyOrderId }, { status: 202 });
  } catch (err) {
    console.error(`[shop-order-create] 💥 erro interno — IP: ${ip}`, err);
    return NextResponse.json({ error: 'Erro interno ao enfileirar job', detail: (err as Error).message }, { status: 500 });
  }
}
