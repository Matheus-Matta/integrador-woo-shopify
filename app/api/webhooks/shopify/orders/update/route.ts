import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAuth } from '@/lib/auth/dashboard';
import { verifyShopifyHmac } from '@/lib/utils/webhook-validator';
import { ordersQueue } from '@/lib/queue/queues';
import { logError, logOrder } from '@/lib/services/logger';
import { deduplicateDelivery, deduplicateFingerprint } from '@/lib/services/webhookDedup';
import { syncShopifyWebhookToWooCompat } from '@/services/woo-compatible-shopify-sync';

function parseOrderForLog(rawBody: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(rawBody || '{}');
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function fingerprintWebhook(rawBody: string): string {
  return createHash('sha256').update(rawBody, 'utf8').digest('hex');
}

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth(req);
  if (auth) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.json({
    active: true,
    webhook: 'shop-order-update',
    route: '/api/webhooks/shopify/orders/update',
    method: 'POST',
    description: 'Recebe notificacoes de atualizacao de pedido do Shopify',
  });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  console.log(`[shop-order-update] POST recebido - IP: ${ip}`);

  try {
    const rawBody = await req.text();
    const sig = req.headers.get('x-shopify-hmac-sha256') || '';
    const deliveryId = req.headers.get('x-shopify-delivery-id');
    const topic = req.headers.get('x-shopify-topic');
    const order = parseOrderForLog(rawBody);
    const shopifyOrderId = String(order?.id ?? '');
    const shopifyOrderName = String(order?.name ?? '');

    if (!verifyShopifyHmac(rawBody, sig)) {
      console.warn(`[shop-order-update] HMAC invalido - rejeitado IP: ${ip}`);
      await logError({
        flow: 'shop-order-update',
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
        console.warn(`[shop-order-update] delivery duplicado - descartado: ${deliveryId}`);
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

    if (!shopifyOrderId) {
      console.warn('[shop-order-update] campo obrigatorio ausente - orderId');
      await logOrder({
        action: 'webhook_rejected_missing_fields',
        webhook: order ?? undefined,
        payload: { reason: 'missing-order-id', ip, deliveryId, topic },
        status: 'skipped',
      });
      return NextResponse.json({ error: 'id do pedido e obrigatorio' }, { status: 400 });
    }

    const fingerprint = fingerprintWebhook(rawBody);
    const isNewPayload = await deduplicateFingerprint('shop-order-update', shopifyOrderId, fingerprint, 600);
    if (!isNewPayload) {
      console.warn(`[shop-order-update] payload duplicado na janela de dedupe - descartado: ${shopifyOrderId}`);
      await logOrder({
        shopify_order_id: shopifyOrderId,
        shopify_order_name: shopifyOrderName,
        action: 'webhook_skipped_duplicate_payload',
        webhook: order,
        payload: { reason: 'duplicate-payload', dedupeWindowSeconds: 600, fingerprint, ip, deliveryId, topic },
        status: 'skipped',
      });
      return NextResponse.json({ skipped: true, reason: 'duplicate-payload' });
    }

    const wooCompatibleSync = await syncShopifyWebhookToWooCompat('order', order ?? {});

    const job = await ordersQueue.add('shop-order-update', order ?? {});
    console.info(`[shop-order-update] enfileirado - jobId=${job.id} shopifyOrderId=${shopifyOrderId}`);
    return NextResponse.json({ queued: true, jobId: job.id, shopifyOrderId, wooCompatibleSync }, { status: 202 });
  } catch (err) {
    console.error(`[shop-order-update] erro interno - IP: ${ip}`, err);
    return NextResponse.json({ error: 'Erro interno ao enfileirar job', detail: (err as Error).message }, { status: 500 });
  }
}
