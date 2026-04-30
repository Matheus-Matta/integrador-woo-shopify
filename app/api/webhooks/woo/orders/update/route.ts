import { NextRequest, NextResponse } from 'next/server';
import { verifyWooHmac } from '@/lib/utils/webhook-validator';
import { ordersQueue } from '@/lib/queue/queues';
import { logError } from '@/lib/services/logger';
import { deduplicateDelivery } from '@/lib/services/webhookDedup';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.arrayBuffer();
    const buffer = Buffer.from(rawBody);
    const sig = req.headers.get('x-wc-webhook-signature') || '';

    const ip = req.headers.get('x-forwarded-for') || 'unknown';

    if (!verifyWooHmac(buffer, sig)) {
      void logError({ flow: 'woo-order-update', error_message: 'HMAC inválido', payload: { sig: sig ?? '(vazio)', ip } });
      return NextResponse.json({ error: 'Assinatura invalida' }, { status: 401 });
    }

    const deliveryId = req.headers.get('x-wc-webhook-delivery-id');
    if (deliveryId) {
      const isNew = await deduplicateDelivery(deliveryId);
      if (!isNew) {
        return NextResponse.json({ skipped: true, reason: 'duplicate-delivery' });
      }
    }

    const source = req.headers.get('x-wc-webhook-source') || 'unknown';
    const data = JSON.parse(buffer.toString('utf8') || '{}');
    const orderId = String(data?.id ?? '');

    if (!orderId) {
      return NextResponse.json({ error: 'id do pedido é obrigatorio' }, { status: 400 });
    }

    const payload = { ...data, _woo_source: source };

    const job = await ordersQueue.add('woo-order-update', payload);
    return NextResponse.json({ queued: true, jobId: job.id, wooOrderId: orderId }, { status: 202 });
  } catch (err) {
    return NextResponse.json({ error: 'Erro interno ao enfileirar job', detail: (err as Error).message }, { status: 500 });
  }
}
