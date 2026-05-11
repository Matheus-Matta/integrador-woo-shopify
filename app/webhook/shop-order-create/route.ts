import { NextRequest, NextResponse } from 'next/server';
import { verifyShopifyHmac } from '@/lib/utils/webhook-validator';
import { ordersQueue } from '@/lib/queue/queues';
import { logError, logOrder } from '@/lib/services/logger';
import { connectMongo } from '@/lib/db/mongo';

function parseOrderForLog(buffer: Buffer): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(buffer.toString('utf8') || '{}');
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const deliveryId = req.headers.get('x-shopify-delivery-id');
  const topic = req.headers.get('x-shopify-topic');

  console.log('[Webhook] Recebido POST em /webhook/shop-order-create');
  console.log(`[Webhook] IP: ${ip} | Topic: ${topic} | Delivery ID: ${deliveryId}`);

  try {
    await connectMongo();

    const rawBody = await req.arrayBuffer();
    const buffer = Buffer.from(rawBody);
    const sig = req.headers.get('x-shopify-hmac-sha256') || '';
    const order = parseOrderForLog(buffer);
    const shopifyOrderId = String(order?.id ?? '');
    const shopifyOrderName = String(order?.name ?? '');

    if (!verifyShopifyHmac(buffer, sig)) {
      console.warn(`[Webhook] HMAC invalido em /webhook/shop-order-create de ${ip}`);
      await logError({
        flow: 'shop-order-create',
        error_message: 'HMAC invalido (tentativa em /webhook/shop-order-create)',
        payload: { sigPresent: Boolean(sig), sigLen: sig.length, ip, deliveryId, topic, shopifyOrderName: shopifyOrderName || undefined },
        entity_type: 'order',
        entity_id: shopifyOrderId || undefined,
        shopify_order_id: shopifyOrderId || undefined,
      });
      if (shopifyOrderId) {
        await logOrder({
          shopify_order_id: shopifyOrderId,
          shopify_order_name: shopifyOrderName,
          action: 'webhook_rejected_hmac',
          webhook: order,
          payload: { reason: 'invalid-hmac', sigPresent: Boolean(sig), sigLen: sig.length, ip, deliveryId, topic },
          status: 'skipped',
        });
      }
      return NextResponse.json({ error: 'Assinatura invalida' }, { status: 401 });
    }

    console.log(`[Webhook] Payload validado: Pedido ${shopifyOrderName} (ID: ${shopifyOrderId})`);

    if (!shopifyOrderId) {
      await logOrder({
        action: 'webhook_rejected_missing_fields',
        webhook: order ?? undefined,
        payload: { reason: 'missing-order-id', ip, deliveryId, topic },
        status: 'skipped',
      });
      return NextResponse.json({ error: 'id do pedido e obrigatorio' }, { status: 400 });
    }

    await logOrder({
      shopify_order_id: shopifyOrderId,
      shopify_order_name: shopifyOrderName,
      action: 'webhook_received',
      webhook: order,
      status: 'success',
    });

    const job = await ordersQueue.add('shop-order-create', order ?? {}, {
      jobId: `shop-order-create:${shopifyOrderId}`,
    });
    console.log(`[Webhook] Job enfileirado na BullMQ: ${job.id}`);

    return NextResponse.json({
      queued: true,
      jobId: job.id,
      shopifyOrderId,
      message: 'Recebido e enfileirado com sucesso',
    }, { status: 202 });
  } catch (err) {
    const error = err as Error;
    console.error(`[Webhook] Erro critico no processamento: ${error.message}`);
    return NextResponse.json({
      error: 'Erro interno ao processar webhook',
      detail: error.message,
    }, { status: 500 });
  }
}
