import { NextRequest, NextResponse } from 'next/server';
import { verifyShopifyHmac } from '@/lib/utils/webhook-validator';
import { ordersQueue } from '@/lib/queue/queues';
import { logError } from '@/lib/services/logger';
import { s } from '@/lib/utils/helpers';
import { deduplicateDelivery, deduplicateOrder } from '@/lib/services/webhookDedup';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  console.log(`[Webhook] 📥 Recebido POST em /api/webhooks/shopify/orders/create de ${ip}`);

  try {
    const rawBody = await req.text();
    const sig = req.headers.get('x-shopify-hmac-sha256') || '';

    const ip = req.headers.get('x-forwarded-for') || 'unknown';

    if (!verifyShopifyHmac(rawBody, sig)) {
      console.warn(`[shop-order-create] HMAC inválido — assinatura rejeitada IP: ${ip}`);
      void logError({ flow: 'shop-order-create', error_message: 'HMAC inválido', payload: { sig: sig ?? '(vazio)', ip } });
      return NextResponse.json({ error: 'Assinatura invalida' }, { status: 401 });
    }

    const deliveryId = req.headers.get('x-shopify-delivery-id');
    if (deliveryId) {
      const isNew = await deduplicateDelivery(deliveryId);
      if (!isNew) {
        console.warn(`[shop-order-create] delivery-id duplicado — descartado: ${deliveryId}`);
        return NextResponse.json({ skipped: true, reason: 'duplicate-delivery' });
      }
    }

    const orderString = rawBody;
    const order = JSON.parse(orderString || '{}');

    const email = s(order?.contact_email ?? order?.email);
    const shopifyOrderId = String(order?.id ?? '');
    if (!email || !shopifyOrderId) {
      return NextResponse.json({ error: 'email e id do pedido sao obrigatorios' }, { status: 400 });
    }

    const isNewOrder = await deduplicateOrder('shop-order-create', shopifyOrderId);
    if (!isNewOrder) {
      console.warn(`[shop-order-create] order duplicado na janela de 30s — descartado: ${shopifyOrderId}`);
      return NextResponse.json({ skipped: true, reason: 'duplicate-order' });
    }

    const job = await ordersQueue.add('shop-order-create', order);
    console.info(`[shop-order-create] webhook enfileirado com sucesso jobId=${job.id} shopifyOrderId=${shopifyOrderId}`);
    return NextResponse.json({ queued: true, jobId: job.id, shopifyOrderId }, { status: 202 });
  } catch (err) {
    console.error('Erro ao enfileirar shop-order-create', err);
    return NextResponse.json({ error: 'Erro interno ao enfileirar job', detail: (err as Error).message }, { status: 500 });
  }
}
