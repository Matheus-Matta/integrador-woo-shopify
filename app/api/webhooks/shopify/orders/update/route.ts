import { NextRequest, NextResponse } from 'next/server';
import { verifyShopifyHmac } from '@/lib/utils/webhook-validator';
import { ordersQueue } from '@/lib/queue/queues';
import { logError } from '@/lib/services/logger';
import { s } from '@/lib/utils/helpers';
import { deduplicateDelivery, deduplicateOrder } from '@/lib/services/webhookDedup';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  console.log(`[Webhook] 📥 Recebido POST em /api/webhooks/shopify/orders/update de ${ip}`);

  try {
    const rawBody = await req.text();
    const sig = req.headers.get('x-shopify-hmac-sha256') || '';

    const ip = req.headers.get('x-forwarded-for') || 'unknown';

    if (!verifyShopifyHmac(rawBody, sig)) {
      console.warn(`[shop-order-update] HMAC inválido — assinatura rejeitada IP: ${ip}`);
      void logError({ flow: 'shop-order-update', error_message: 'HMAC inválido', payload: { sig: sig ?? '(vazio)', ip } });
      return NextResponse.json({ error: 'Assinatura invalida' }, { status: 401 });
    }

    const deliveryId = req.headers.get('x-shopify-delivery-id');
    if (deliveryId) {
      const isNew = await deduplicateDelivery(deliveryId);
      if (!isNew) {
        return NextResponse.json({ skipped: true, reason: 'duplicate-delivery' });
      }
    }

    const orderString = rawBody;
    const order = JSON.parse(orderString || '{}');

    const shopifyOrderId = String(order?.id ?? '');
    if (!shopifyOrderId) {
      return NextResponse.json({ error: 'id do pedido é obrigatorio' }, { status: 400 });
    }

    const isNewOrder = await deduplicateOrder('shop-order-update', shopifyOrderId);
    if (!isNewOrder) {
      return NextResponse.json({ skipped: true, reason: 'duplicate-order' });
    }

    const job = await ordersQueue.add('shop-order-update', order);
    return NextResponse.json({ queued: true, jobId: job.id, shopifyOrderId }, { status: 202 });
  } catch (err) {
    return NextResponse.json({ error: 'Erro interno ao enfileirar job', detail: (err as Error).message }, { status: 500 });
  }
}
