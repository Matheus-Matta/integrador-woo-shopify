import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAuth } from '@/lib/auth/dashboard';
import { verifyWooHmac } from '@/lib/utils/webhook-validator';
import { ordersQueue } from '@/lib/queue/queues';
import { logError } from '@/lib/services/logger';
import { deduplicateDelivery } from '@/lib/services/webhookDedup';

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth(req);
  if (auth) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.json({
    active: true,
    webhook: 'woo-order-update',
    route: '/api/webhooks/woo/orders/update',
    method: 'POST',
    description: 'Recebe notificações de atualização de pedido do WooCommerce',
  });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  console.log(`[woo-order-update] 📥 POST recebido — IP: ${ip}`);

  try {
    const rawBody = await req.arrayBuffer();
    const buffer = Buffer.from(rawBody);
    const sig = req.headers.get('x-wc-webhook-signature') || '';

    if (!verifyWooHmac(buffer, sig)) {
      console.warn(`[woo-order-update] ⚠️ HMAC inválido — rejeitado IP: ${ip}`);
      void logError({ flow: 'woo-order-update', error_message: 'HMAC inválido', payload: { sigPresent: Boolean(sig), sigLen: sig.length, ip } });
      return NextResponse.json({ error: 'Assinatura invalida' }, { status: 401 });
    }

    const deliveryId = req.headers.get('x-wc-webhook-delivery-id');
    if (deliveryId) {
      const isNew = await deduplicateDelivery(deliveryId);
      if (!isNew) {
        console.warn(`[woo-order-update] ⏭️ delivery duplicado — descartado: ${deliveryId}`);
        return NextResponse.json({ skipped: true, reason: 'duplicate-delivery' });
      }
    }

    const source = req.headers.get('x-wc-webhook-source') || 'unknown';
    const data = JSON.parse(buffer.toString('utf8') || '{}');
    const orderId = String(data?.id ?? '');

    if (!orderId) {
      console.warn(`[woo-order-update] ❌ campo obrigatório ausente — orderId`);
      return NextResponse.json({ error: 'id do pedido é obrigatorio' }, { status: 400 });
    }

    const payload = { ...data, _woo_source: source };
    const job = await ordersQueue.add('woo-order-update', payload);
    console.info(`[woo-order-update] ✅ enfileirado — jobId=${job.id} wooOrderId=${orderId} source=${source}`);
    return NextResponse.json({ queued: true, jobId: job.id, wooOrderId: orderId }, { status: 202 });
  } catch (err) {
    console.error(`[woo-order-update] 💥 erro interno — IP: ${ip}`, err);
    return NextResponse.json({ error: 'Erro interno ao enfileirar job', detail: (err as Error).message }, { status: 500 });
  }
}
