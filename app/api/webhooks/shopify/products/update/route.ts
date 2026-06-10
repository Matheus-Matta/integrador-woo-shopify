import { NextRequest, NextResponse } from 'next/server';
import { productsQueue } from '@/lib/queue/queues';
import { logError } from '@/lib/services/logger';
import { verifyShopifyHmac } from '@/lib/utils/webhook-validator';
import { deduplicateDelivery } from '@/lib/services/webhookDedup';
import { syncShopifyWebhookToWooCompat } from '@/services/woo-compatible-shopify-sync';

export async function GET() {
  return NextResponse.json({
    active: true,
    webhook: 'shopify-products-update',
    route: '/api/webhooks/shopify/products/update',
    method: 'POST',
    description: 'Recebe eventos de produtos atualizados do Shopify e envia para a Lexos',
  });
}

export async function POST(req: NextRequest) {
  const deliveryId = req.headers.get('x-shopify-delivery-id') ?? `missing-${Date.now()}`;
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  
  console.log(`[shopify-products-update] POST recebido - IP: ${ip} | Delivery: ${deliveryId}`);

  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-shopify-hmac-sha256') || '';
    const isVerified = verifyShopifyHmac(rawBody, signature);
    
    if (!isVerified) {
      console.warn(`[shopify-products-update] Validação HMAC falhou - IP: ${ip}`);
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
      console.warn(`[shopify-products-update] Webhook duplicado descartado: ${deliveryId}`);
      return NextResponse.json({ skipped: true, reason: 'duplicate-delivery' });
    }

    const payload = JSON.parse(rawBody);
    const productId = payload?.id;

    if (!productId) {
      return NextResponse.json({ error: 'payload inválido' }, { status: 400 });
    }

    const wooCompatibleSync = await syncShopifyWebhookToWooCompat('product', payload);

    // Usamos o mesmo job para create/update, pois o comportamento de upsert 
    // dependerá da lógica interna do handler
    const job = await productsQueue.add('shop-product-to-lexos', payload, {
      jobId: `shop-product-update-${productId}-${Date.now()}`,
    });

    console.info(`[shopify-products-update] Job enfileirado: ${job.id} para o produto ${productId}`);
    return NextResponse.json({ received: true, jobId: job.id, wooCompatibleSync }, { status: 202 });
  } catch (err) {
    console.error(`[shopify-products-update] Erro: ${(err as Error).message}`);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
