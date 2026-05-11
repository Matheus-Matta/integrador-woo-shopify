import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAuth } from '@/lib/auth/dashboard';
import { verifyShopifyHmac } from '@/lib/utils/webhook-validator';
import { ordersQueue } from '@/lib/queue/queues';
import { logError, logOrder } from '@/lib/services/logger';
import { s } from '@/lib/utils/helpers';
import { deduplicateDelivery, deduplicateOrder } from '@/lib/services/webhookDedup';

function parseOrderForLog(rawBody: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(rawBody || '{}');
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

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
    description: 'Recebe notificacoes de criacao de pedido do Shopify',
  });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  console.log(`[shop-order-create] POST recebido - IP: ${ip}`);

  try {
    const rawBody = await req.text();
    const sig = req.headers.get('x-shopify-hmac-sha256') || '';
    const deliveryId = req.headers.get('x-shopify-delivery-id');
    const topic = req.headers.get('x-shopify-topic');
    const order = parseOrderForLog(rawBody);
    const email = s(order?.contact_email ?? order?.email);
    const shopifyOrderId = String(order?.id ?? '');
    const shopifyOrderName = String(order?.name ?? '');

    if (!verifyShopifyHmac(rawBody, sig)) {
      console.warn(`[shop-order-create] HMAC invalido - rejeitado IP: ${ip}`);
      await logError({
        flow: 'shop-order-create',
        error_message: 'HMAC invalido',
        payload: {
          sigPresent: Boolean(sig),
          sigLen: sig.length,
          ip,
          deliveryId,
          topic,
          rawBodyLen: rawBody.length,
          shopifyOrderName: shopifyOrderName || undefined,
        },
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

    if (deliveryId) {
      const isNew = await deduplicateDelivery(deliveryId);
      if (!isNew) {
        console.warn(`[shop-order-create] delivery duplicado - descartado: ${deliveryId}`);
        await logOrder({
          shopify_order_id: shopifyOrderId || undefined,
          shopify_order_name: shopifyOrderName,
          action: 'webhook_skipped_duplicate_delivery',
          webhook: order,
          payload: { reason: 'duplicate-delivery', deliveryId, ip, topic },
          status: 'skipped',
        });
        return NextResponse.json({ skipped: true, reason: 'duplicate-delivery' });
      }
    }

    if (!email || !shopifyOrderId) {
      console.warn(`[shop-order-create] campos obrigatorios ausentes - email: ${!!email}, orderId: ${!!shopifyOrderId}`);
      await logOrder({
        shopify_order_id: shopifyOrderId || undefined,
        shopify_order_name: shopifyOrderName,
        action: 'webhook_rejected_missing_fields',
        webhook: order ?? undefined,
        payload: { reason: 'missing-required-fields', hasEmail: Boolean(email), hasOrderId: Boolean(shopifyOrderId), ip, deliveryId, topic },
        status: 'skipped',
      });
      return NextResponse.json({ error: 'email e id do pedido sao obrigatorios' }, { status: 400 });
    }

    const isNewOrder = await deduplicateOrder('shop-order-create', shopifyOrderId);
    if (!isNewOrder) {
      console.warn(`[shop-order-create] order duplicado na janela de dedupe - descartado: ${shopifyOrderId}`);
      await logOrder({
        shopify_order_id: shopifyOrderId,
        shopify_order_name: shopifyOrderName,
        action: 'webhook_skipped_duplicate_order_window',
        webhook: order,
        payload: { reason: 'duplicate-order', dedupeWindowSeconds: 604800, ip, deliveryId, topic },
        status: 'skipped',
      });
      return NextResponse.json({ skipped: true, reason: 'duplicate-order' });
    }

    const job = await ordersQueue.add('shop-order-create', order ?? {}, {
      jobId: `shop-order-create:${shopifyOrderId}`,
    });
    console.info(`[shop-order-create] enfileirado - jobId=${job.id} shopifyOrderId=${shopifyOrderId}`);
    return NextResponse.json({ queued: true, jobId: job.id, shopifyOrderId }, { status: 202 });
  } catch (err) {
    console.error(`[shop-order-create] erro interno - IP: ${ip}`, err);
    return NextResponse.json({ error: 'Erro interno ao enfileirar job', detail: (err as Error).message }, { status: 500 });
  }
}
