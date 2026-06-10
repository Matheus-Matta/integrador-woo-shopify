import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAuth } from '@/lib/auth/dashboard';
import { config } from '@/lib/config';
import { verifyWooHmac } from '@/lib/utils/webhook-validator';
import { productsQueue } from '@/lib/queue/queues';
import { logError } from '@/lib/services/logger';
import { deduplicateDelivery, deduplicateFingerprint } from '@/lib/services/webhookDedup';

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth(req);
  if (auth) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.json({
    active: config.wooCompatibleApi.legacyWooWebhooksActive,
    legacy: true,
    deprecated: true,
    webhook: 'woo-product',
    route: '/api/webhooks/woo/products',
    method: 'POST',
    description: 'Webhook legado do WooCommerce mantido temporariamente durante a migracao para Shopify -> API Woo compativel',
  });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  console.log(`[woo-product] POST recebido - IP: ${ip}`);

  try {
    if (!config.wooCompatibleApi.legacyWooWebhooksActive) {
      console.info('[woo-product] webhook legado desativado por configuracao - ignorado');
      return NextResponse.json({ skipped: true, legacy: true, reason: 'woo-legacy-webhook-disabled' });
    }

    const rawBody = await req.arrayBuffer();
    const buffer = Buffer.from(rawBody);
    const sig = req.headers.get('x-wc-webhook-signature') || '';

    if (!verifyWooHmac(buffer, sig)) {
      console.warn(`[woo-product] HMAC invalido - rejeitado IP: ${ip}`);
      void logError({ flow: 'woo-product', error_message: 'HMAC invalido', payload: { sigPresent: Boolean(sig), sigLen: sig.length, ip } });
      return NextResponse.json({ error: 'Assinatura invalida' }, { status: 401 });
    }

    const deliveryId = req.headers.get('x-wc-webhook-delivery-id');
    if (deliveryId) {
      const isNew = await deduplicateDelivery(deliveryId);
      if (!isNew) {
        console.warn(`[woo-product] delivery duplicado - descartado: ${deliveryId}`);
        return NextResponse.json({ skipped: true, reason: 'duplicate-delivery' });
      }
    }

    const bodyStr = buffer.toString('utf8').trim();

    if (bodyStr.startsWith('webhook_id=') || !bodyStr) {
      console.info(`[woo-product] recebido ping ou corpo nao-JSON - ignorado: ${bodyStr.substring(0, 50)}`);
      return NextResponse.json({ ok: true, message: 'ping received' });
    }

    let data;
    try {
      data = JSON.parse(bodyStr);
    } catch (e) {
      console.warn(`[woo-product] erro ao parsear JSON: ${(e as Error).message}`);
      return NextResponse.json({ error: 'JSON invalido' }, { status: 400 });
    }

    const sku = String(data?.sku ?? '').trim();

    if (!sku) {
      console.warn('[woo-product] SKU ausente - descartado');
      return NextResponse.json({ skipped: true, reason: 'no-sku' });
    }

    const fingerprint = createHash('sha256').update(bodyStr).digest('hex');
    const isNewPayload = await deduplicateFingerprint('woo-product', sku, fingerprint, 60);
    if (!isNewPayload) {
      console.warn(`[woo-product] payload identico duplicado - descartado sku=${sku}`);
      return NextResponse.json({ skipped: true, reason: 'duplicate-product-payload' });
    }

    const source = req.headers.get('x-wc-webhook-source') || 'unknown';
    const payload = { ...data, _woo_source: source };
    const job = await productsQueue.add('woo-product', payload);
    console.info(`[woo-product] enfileirado - jobId=${job.id} sku=${sku} source=${source}`);
    return NextResponse.json({ queued: true, jobId: job.id, sku }, { status: 202 });
  } catch (err) {
    console.error(`[woo-product] erro interno - IP: ${ip}`, err);
    return NextResponse.json({ error: 'Erro interno ao enfileirar job', detail: (err as Error).message }, { status: 500 });
  }
}
