import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAuth } from '@/lib/auth/dashboard';
import { config } from '@/lib/config';
import { verifyWooHmac } from '@/lib/utils/webhook-validator';
import { ordersQueue } from '@/lib/queue/queues';
import { logError, logOrder } from '@/lib/services/logger';
import { deduplicateDelivery } from '@/lib/services/webhookDedup';

function parseWooOrderForLog(buffer: Buffer): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(buffer.toString('utf8') || '{}');
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
    active: config.wooCompatibleApi.legacyWooWebhooksActive,
    legacy: true,
    deprecated: true,
    webhook: 'woo-order-update',
    route: '/api/webhooks/woo/orders/update',
    method: 'POST',
    description: 'Webhook legado do WooCommerce mantido temporariamente durante a migracao para Shopify -> API Woo compativel',
  });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  console.log(`[woo-order-update] POST recebido - IP: ${ip}`);

  try {
    if (!config.wooCompatibleApi.legacyWooWebhooksActive) {
      console.info('[woo-order-update] webhook legado desativado por configuracao - ignorado');
      return NextResponse.json({ skipped: true, legacy: true, reason: 'woo-legacy-webhook-disabled' });
    }

    const rawBody = await req.arrayBuffer();
    const buffer = Buffer.from(rawBody);
    const sig = req.headers.get('x-wc-webhook-signature') || '';
    const deliveryId = req.headers.get('x-wc-webhook-delivery-id');
    const source = req.headers.get('x-wc-webhook-source') || 'unknown';
    const data = parseWooOrderForLog(buffer);
    const orderId = String(data?.id ?? '');

    if (!verifyWooHmac(buffer, sig)) {
      console.warn(`[woo-order-update] HMAC invalido - rejeitado IP: ${ip}`);
      await logError({
        flow: 'woo-order-update',
        error_message: 'HMAC invalido',
        payload: { sigPresent: Boolean(sig), sigLen: sig.length, ip, deliveryId, source, rawBodyLen: buffer.length },
        entity_type: 'order',
        entity_id: orderId || undefined,
        woo_order_id: orderId ? Number(orderId) : undefined,
      });
      if (orderId) {
        await logOrder({
          woo_order_id: Number(orderId),
          action: 'webhook_rejected_hmac',
          webhook: data,
          payload: { reason: 'invalid-hmac', sigPresent: Boolean(sig), sigLen: sig.length, ip, deliveryId, source },
          status: 'skipped',
        });
      }
      return NextResponse.json({ error: 'Assinatura invalida' }, { status: 401 });
    }

    if (deliveryId) {
      const isNew = await deduplicateDelivery(deliveryId);
      if (!isNew) {
        console.warn(`[woo-order-update] delivery duplicado - descartado: ${deliveryId}`);
        await logOrder({
          woo_order_id: orderId ? Number(orderId) : undefined,
          action: 'webhook_skipped_duplicate_delivery',
          webhook: data,
          payload: { reason: 'duplicate-delivery', deliveryId, ip, source },
          status: 'skipped',
        });
        return NextResponse.json({ skipped: true, reason: 'duplicate-delivery' });
      }
    }

    if (!orderId) {
      console.warn('[woo-order-update] campo obrigatorio ausente - orderId');
      await logOrder({
        action: 'webhook_rejected_missing_fields',
        webhook: data ?? undefined,
        payload: { reason: 'missing-order-id', ip, deliveryId, source },
        status: 'skipped',
      });
      return NextResponse.json({ error: 'id do pedido e obrigatorio' }, { status: 400 });
    }

    const payload = { ...(data ?? {}), _woo_source: source };
    const job = await ordersQueue.add('woo-order-update', payload);
    console.info(`[woo-order-update] enfileirado - jobId=${job.id} wooOrderId=${orderId} source=${source}`);
    return NextResponse.json({ queued: true, jobId: job.id, wooOrderId: orderId }, { status: 202 });
  } catch (err) {
    console.error(`[woo-order-update] erro interno - IP: ${ip}`, err);
    return NextResponse.json({ error: 'Erro interno ao enfileirar job', detail: (err as Error).message }, { status: 500 });
  }
}
