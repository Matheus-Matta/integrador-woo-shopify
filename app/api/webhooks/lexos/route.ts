import { NextRequest, NextResponse } from 'next/server';
import { ordersQueue } from '@/lib/queue/queues';
import { logError } from '@/lib/services/logger';
import { deduplicateDelivery } from '@/lib/services/webhookDedup';
import { config } from '@/lib/config';

export async function GET() {
  return NextResponse.json({
    active: true,
    webhook: 'lexos-central-router',
    route: '/api/webhooks/lexos',
    method: 'POST',
    description: 'Recebe eventos da Lexos Hub e roteia para as filas corretas',
  });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const lexosToken = req.headers.get('Authorization') || req.headers.get('Token') || ''; // A documentação não deixa claro qual header eles mandam de volta, validaremos pela string pura do body se houver token
  
  // Como não há header oficial de ID de entrega no Lexos, usamos um timestamp
  const rawBody = await req.text();
  const deliveryId = `lexos-${Date.now()}`; 

  console.log(`[lexos-webhook-router] POST recebido - IP: ${ip}`);

  try {
    // 1. Validação simples de segurança configurada
    if (config.lexos.webhookToken && config.lexos.webhookToken.length > 0) {
      if (!lexosToken.includes(config.lexos.webhookToken) && !rawBody.includes(config.lexos.webhookToken)) {
         console.warn(`[lexos-webhook-router] Token de validação inválido - IP: ${ip}`);
         return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody);

    // 2. Descoberta do Evento
    // Pode vir via query string (Testar?TipoWebhook=Pedido)
    const url = new URL(req.url);
    const tipoQuery = url.searchParams.get('TipoWebhook');
    
    // Pode vir via payload
    const eventType = tipoQuery || payload?.event || payload?.tipo || 'pedido.atualizado';
    const entityId = payload?.event_id || payload?.id || payload?.pedido_id || payload?.numero_pedido || deliveryId;

    // 3. Deduplicação baseada no evento
    const dedupKey = `lexos-${eventType}-${entityId}`;
    const isNew = await deduplicateDelivery(dedupKey);
    if (!isNew) {
      console.warn(`[lexos-webhook-router] Webhook duplicado descartado: ${dedupKey}`);
      return NextResponse.json({ skipped: true, reason: 'duplicate-delivery' });
    }

    // 4. Roteamento de eventos
    const eventString = String(eventType).toLowerCase();
    
    if (eventString.includes('criado') || eventString === 'pedido') {
      const job = await ordersQueue.add('lexos-order-create', payload, {
        jobId: `lexos-order-create:${entityId}:${Date.now()}`,
      });
      console.info(`[lexos-webhook-router] Job lexos-order-create enfileirado: ${job.id}`);
      return NextResponse.json({ received: true, jobId: job.id }, { status: 202 });
      
    } else if (eventString.includes('atualizado') || eventString.includes('status')) {
      const job = await ordersQueue.add('lexos-order-update', payload, {
        jobId: `lexos-order-update:${entityId}:${Date.now()}`,
      });
      console.info(`[lexos-webhook-router] Job lexos-order-update enfileirado: ${job.id}`);
      return NextResponse.json({ received: true, jobId: job.id }, { status: 202 });
      
    } else {
      console.warn(`[lexos-webhook-router] Evento ignorado: ${eventType}`);
      return NextResponse.json({ skipped: true, reason: 'unsupported-event', eventType });
    }

  } catch (err) {
    console.error(`[lexos-webhook-router] Erro: ${(err as Error).message}`);
    await logError({
      flow: 'lexos-webhook-router',
      error_message: (err as Error).message,
      payload: { rawBody },
    });
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
