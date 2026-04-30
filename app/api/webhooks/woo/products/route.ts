import { NextRequest, NextResponse } from 'next/server';
import { verifyWooHmac } from '@/lib/utils/webhook-validator';
import { productsQueue } from '@/lib/queue/queues';
import { logError } from '@/lib/services/logger';
import { deduplicateDelivery, deduplicateOrder } from '@/lib/services/webhookDedup';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.arrayBuffer();
    const buffer = Buffer.from(rawBody);
    const sig = req.headers.get('x-wc-webhook-signature') || '';

    const ip = req.headers.get('x-forwarded-for') || 'unknown';

    if (!verifyWooHmac(buffer, sig)) {
      void logError({ flow: 'woo-product', error_message: 'HMAC inválido', payload: { sig: sig ?? '(vazio)', ip } });
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
    const sku = String(data?.sku ?? '');

    if (!sku) {
      return NextResponse.json({ skipped: true, reason: 'no-sku' });
    }

    // Deduplicação baseada em SKU para evitar floods
    const isNewAction = await deduplicateOrder('woo-product', sku);
    if (!isNewAction) {
      return NextResponse.json({ skipped: true, reason: 'duplicate-product-action' });
    }

    const payload = { ...data, _woo_source: source };

    const job = await productsQueue.add('woo-product', payload);
    return NextResponse.json({ queued: true, jobId: job.id, sku }, { status: 202 });
  } catch (err) {
    return NextResponse.json({ error: 'Erro interno ao enfileirar job', detail: (err as Error).message }, { status: 500 });
  }
}
