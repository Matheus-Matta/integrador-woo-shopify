import { NextRequest, NextResponse } from 'next/server';
import { verifyShopifyHmac } from '@/lib/utils/webhook-validator';
import { ordersQueue } from '@/lib/queue/queues';
import { logError, logOrder } from '@/lib/services/logger';
import { connectMongo } from '@/lib/db/mongo';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const deliveryId = req.headers.get('x-shopify-delivery-id');
  const topic = req.headers.get('x-shopify-topic');
  
  console.log(`[Webhook] 📥 Recebido POST em /webhook/shop-order-create`);
  console.log(`[Webhook] IP: ${ip} | Topic: ${topic} | Delivery ID: ${deliveryId}`);

  try {
    await connectMongo();
    
    const rawBody = await req.arrayBuffer();
    const buffer = Buffer.from(rawBody);
    const sig = req.headers.get('x-shopify-hmac-sha256') || '';

    if (!verifyShopifyHmac(buffer, sig)) {
      console.warn(`[Webhook] ❌ HMAC INVÁLIDO em /webhook/shop-order-create de ${ip}`);
      void logError({ 
        flow: 'shop-order-create', 
        error_message: 'HMAC inválido (tentativa em /webhook/shop-order-create)', 
        payload: { sig: sig || '(vazio)', ip, deliveryId, topic } 
      });
      return NextResponse.json({ error: 'Assinatura invalida' }, { status: 401 });
    }

    const orderString = buffer.toString('utf8');
    const order = JSON.parse(orderString || '{}');
    const shopifyOrderId = String(order?.id ?? '');
    const shopifyOrderName = String(order?.name ?? '');

    console.log(`[Webhook] ✅ Payload validado: Pedido ${shopifyOrderName} (ID: ${shopifyOrderId})`);

    if (!shopifyOrderId) {
      return NextResponse.json({ error: 'id do pedido é obrigatorio' }, { status: 400 });
    }

    await logOrder({
        shopify_order_id: shopifyOrderId,
        shopify_order_name: shopifyOrderName,
        action: 'webhook_received',
        webhook: order,
        status: 'success'
    });

    const job = await ordersQueue.add('shop-order-create', order);
    console.log(`[Webhook] 🚀 Job enfileirado na BullMQ: ${job.id}`);

    return NextResponse.json({ 
      queued: true, 
      jobId: job.id, 
      shopifyOrderId,
      message: 'Recebido e enfileirado com sucesso'
    }, { status: 202 });

  } catch (err) {
    const error = err as Error;
    console.error(`[Webhook] 💥 Erro crítico no processamento: ${error.message}`);
    return NextResponse.json({ 
        error: 'Erro interno ao processar webhook', 
        detail: error.message 
    }, { status: 500 });
  }
}
