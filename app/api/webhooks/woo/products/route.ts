import { NextRequest, NextResponse } from 'next/server';
import { verifyWooHmac } from '@/lib/utils/webhook-validator';
import { productsQueue } from '@/lib/queue/queues';
import { logError } from '@/lib/services/logger';
import { deduplicateDelivery, deduplicateOrder } from '@/lib/services/webhookDedup';

export async function GET(req: NextRequest) {
  if (!req.cookies.get('dash_token')?.value) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.json({
    active: true,
    webhook: 'woo-product',
    route: '/api/webhooks/woo/products',
    method: 'POST',
    description: 'Recebe notificações de atualização de produto do WooCommerce',
  });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  console.log(`[woo-product] 📥 POST recebido — IP: ${ip}`);

  try {
    const rawBody = await req.arrayBuffer();
    const buffer = Buffer.from(rawBody);
    const sig = req.headers.get('x-wc-webhook-signature') || '';

    if (!verifyWooHmac(buffer, sig)) {
      console.warn(`[woo-product] ⚠️ HMAC inválido — rejeitado IP: ${ip}`);
      void logError({ flow: 'woo-product', error_message: 'HMAC inválido', payload: { sig: sig ?? '(vazio)', ip } });
      return NextResponse.json({ error: 'Assinatura invalida' }, { status: 401 });
    }

    const deliveryId = req.headers.get('x-wc-webhook-delivery-id');
    if (deliveryId) {
      const isNew = await deduplicateDelivery(deliveryId);
      if (!isNew) {
        console.warn(`[woo-product] ⏭️ delivery duplicado — descartado: ${deliveryId}`);
        return NextResponse.json({ skipped: true, reason: 'duplicate-delivery' });
      }
    }

    const source = req.headers.get('x-wc-webhook-source') || 'unknown';
    const data = JSON.parse(buffer.toString('utf8') || '{}');
    const sku = String(data?.sku ?? '');

    if (!sku) {
      console.warn(`[woo-product] ❌ SKU ausente — descartado`);
      return NextResponse.json({ skipped: true, reason: 'no-sku' });
    }

    // Deduplicação baseada em SKU para evitar floods
    const isNewAction = await deduplicateOrder('woo-product', sku);
    if (!isNewAction) {
      console.warn(`[woo-product] ⏭️ produto duplicado (30s) — descartado sku=${sku}`);
      return NextResponse.json({ skipped: true, reason: 'duplicate-product-action' });
    }

    const payload = { ...data, _woo_source: source };
    const job = await productsQueue.add('woo-product', payload);
    console.info(`[woo-product] ✅ enfileirado — jobId=${job.id} sku=${sku} source=${source}`);
    return NextResponse.json({ queued: true, jobId: job.id, sku }, { status: 202 });
  } catch (err) {
    console.error(`[woo-product] 💥 erro interno — IP: ${ip}`, err);
    return NextResponse.json({ error: 'Erro interno ao enfileirar job', detail: (err as Error).message }, { status: 500 });
  }
}
