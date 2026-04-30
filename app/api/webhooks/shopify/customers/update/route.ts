import { NextRequest, NextResponse } from 'next/server';
import { verifyShopifyHmac } from '@/lib/utils/webhook-validator';
import { ordersQueue } from '@/lib/queue/queues';
import { logError } from '@/lib/services/logger';
import { deduplicateDelivery } from '@/lib/services/webhookDedup';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const sig = req.headers.get('x-shopify-hmac-sha256') || '';

    const ip = req.headers.get('x-forwarded-for') || 'unknown';

    if (!verifyShopifyHmac(rawBody, sig)) {
      console.warn(`[shop-customer-update] HMAC inválido — assinatura rejeitada IP: ${ip}`);
      void logError({ flow: 'shop-customer-update', error_message: 'HMAC inválido', payload: { sig: sig ?? '(vazio)', ip } });
      return NextResponse.json({ error: 'Assinatura invalida' }, { status: 401 });
    }

    const deliveryId = req.headers.get('x-shopify-delivery-id');
    if (deliveryId) {
      const isNew = await deduplicateDelivery(deliveryId);
      if (!isNew) {
        return NextResponse.json({ skipped: true, reason: 'duplicate-delivery' });
      }
    }

    const data = JSON.parse(buffer.toString('utf8') || '{}');

    if (!data?.email) {
      return NextResponse.json({ error: 'email do cliente é obrigatorio' }, { status: 400 });
    }

    const job = await ordersQueue.add('shop-customer-update', data);
    return NextResponse.json({ queued: true, jobId: job.id, shopifyCustomerId: data.id }, { status: 202 });
  } catch (err) {
    return NextResponse.json({ error: 'Erro interno ao enfileirar job', detail: (err as Error).message }, { status: 500 });
  }
}
