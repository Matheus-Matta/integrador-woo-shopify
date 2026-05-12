import { NextRequest, NextResponse } from 'next/server';
import { productsQueue } from '@/lib/queue/queues';
import { logError } from '@/lib/services/logger';
import { verifyShopifyHmac } from '@/lib/utils/webhook-validator';
import { deduplicateDelivery } from '@/lib/services/webhookDedup';

export async function GET() {
  return NextResponse.json({
    active: true,
    webhook: 'shopify-products-create',
    route: '/api/webhooks/shopify/products/create',
    method: 'POST',
    description: 'Recebe eventos de produtos criados do Shopify e envia para a Lexos',
  });
}

export async function POST(req: NextRequest) {
  const deliveryId = req.headers.get('x-shopify-delivery-id') ?? `missing-${Date.now()}`;
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  
  console.log(`[shopify-products-create] POST recebido - IP: ${ip} | Delivery: ${deliveryId}`);

  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-shopify-hmac-sha256') || '';
    const isVerified = verifyShopifyHmac(rawBody, signature);
    
    if (!isVerified) {
      console.warn(`[shopify-products-create] Validação HMAC falhou - IP: ${ip}`);
      await logError({
        flow: 'shop-product-to-lexos',
        error_message: 'Validação HMAC falhou',
        payload: { ip, deliveryId },
        entity_type: 'product'
      });
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const isNew = await deduplicateDelivery(deliveryId);
    if (!isNew) {
      console.warn(`[shopify-products-create] Webhook duplicado descartado: ${deliveryId}`);
      return NextResponse.json({ skipped: true, reason: 'duplicate-delivery' });
    }

    const payload = JSON.parse(rawBody);
    const productId = payload?.id;

    if (!productId) {
      return NextResponse.json({ error: 'payload inválido' }, { status: 400 });
    }

    const job = await productsQueue.add('shop-product-to-lexos', payload, {
      jobId: `shop-product-create:${productId}:${Date.now()}`,
    });

    console.info(`[shopify-products-create] Job enfileirado: ${job.id} para o produto ${productId}`);
    return NextResponse.json({ received: true, jobId: job.id }, { status: 202 });
  } catch (err) {
    console.error(`[shopify-products-create] Erro: ${(err as Error).message}`);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
