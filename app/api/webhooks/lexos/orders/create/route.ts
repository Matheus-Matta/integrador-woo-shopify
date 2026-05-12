import { NextRequest, NextResponse } from 'next/server';
import { ordersQueue } from '@/lib/queue/queues';
import { logError, logOrder } from '@/lib/services/logger';
import { deduplicateDelivery, deduplicateOrder } from '@/lib/services/webhookDedup';
import { config } from '@/lib/config';
import { s } from '@/lib/utils/helpers';

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseBody(rawBody: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(rawBody || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Valida o token de segurança enviado pela Lexos.
 *
 * A Lexos pode enviar o token de duas formas (a confirmar no portal):
 *   - Header `X-Webhook-Token`
 *   - Header `Authorization: Bearer <token>`
 *
 * Se `config.lexos.webhookToken` estiver vazio, a validação é ignorada e um
 * aviso é registrado em log. Isso permite testar antes da configuração final.
 */
function verifyLexosToken(req: NextRequest): boolean {
  const expected = s(config.lexos.webhookToken);

  // Sem token configurado → aceita tudo (modo permissivo para desenvolvimento)
  if (!expected) {
    console.warn('[lexos-order-create] LEXOS_WEBHOOK_TOKEN não configurado — validação de token ignorada');
    return true;
  }

  const headerToken =
    s(req.headers.get('x-webhook-token')) ||
    s(req.headers.get('x-lexos-token')) ||
    s(req.headers.get('authorization')).replace(/^bearer\s+/i, '');

  return headerToken === expected;
}

// ─── Route handlers ────────────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json({
    active: true,
    webhook: 'lexos-order-create',
    route: '/api/webhooks/lexos/orders/create',
    method: 'POST',
    description: 'Recebe notificações de criação de pedido do Lexos Hub',
  });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  console.log(`[lexos-order-create] POST recebido — IP: ${ip}`);

  try {
    const rawBody   = await req.text();
    const body      = parseBody(rawBody);

    // Extrai IDs de controle do payload (campos conforme doc Lexos Hub)
    // O payload pode estar na raiz ou dentro de `data`
    const data       = (body?.data ?? body) as Record<string, unknown>;
    const lexosOrderId  = s(data?.pedido_id);
    const lexosOrderNum = s(data?.numero_pedido);

    // ID de entrega único: prefere `event_id` do envelope, fallback para `pedido_id`
    const eventId = s(body?.event_id) || s(body?.id) || lexosOrderId;

    // ── Validação de token ────────────────────────────────────────────────
    if (!verifyLexosToken(req)) {
      console.warn(`[lexos-order-create] Token inválido — rejeitado IP: ${ip}`);
      await logError({
        flow: 'lexos-order-create',
        error_message: 'Token de webhook inválido',
        payload: { ip, eventId, lexosOrderId },
        entity_type: 'order',
        entity_id: lexosOrderId || undefined,
      });
      if (lexosOrderId) {
        await logOrder({
          shopify_order_id: lexosOrderId,
          shopify_order_name: lexosOrderNum,
          action: 'webhook_rejected_invalid_token',
          webhook: body ?? undefined,
          payload: { reason: 'invalid-token', ip, eventId },
          status: 'skipped',
        });
      }
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    // ── Deduplicação por event_id ─────────────────────────────────────────
    if (eventId) {
      const isNew = await deduplicateDelivery(eventId);
      if (!isNew) {
        console.warn(`[lexos-order-create] event_id duplicado — descartado: ${eventId}`);
        await logOrder({
          shopify_order_id: lexosOrderId || undefined,
          shopify_order_name: lexosOrderNum,
          action: 'webhook_skipped_duplicate_delivery',
          webhook: body ?? undefined,
          payload: { reason: 'duplicate-delivery', eventId, ip },
          status: 'skipped',
        });
        return NextResponse.json({ skipped: true, reason: 'duplicate-delivery' });
      }
    }

    // ── Validação de campos obrigatórios ──────────────────────────────────
    if (!lexosOrderId) {
      console.warn('[lexos-order-create] pedido_id ausente no payload');
      await logError({
        flow: 'lexos-order-create',
        error_message: 'pedido_id ausente no payload',
        payload: body ?? {},
        entity_type: 'order',
      });
      return NextResponse.json({ error: 'pedido_id é obrigatório' }, { status: 400 });
    }

    // ── Deduplicação por pedido_id (janela de 7 dias) ─────────────────────
    const isNewOrder = await deduplicateOrder('lexos-order-create', lexosOrderId);
    if (!isNewOrder) {
      console.warn(`[lexos-order-create] pedido duplicado na janela — descartado: ${lexosOrderId}`);
      await logOrder({
        shopify_order_id: lexosOrderId,
        shopify_order_name: lexosOrderNum,
        action: 'webhook_skipped_duplicate_order_window',
        webhook: body ?? undefined,
        payload: { reason: 'duplicate-order', ip, eventId },
        status: 'skipped',
      });
      return NextResponse.json({ skipped: true, reason: 'duplicate-order' });
    }

    // ── Enfileira o job ───────────────────────────────────────────────────
    const job = await ordersQueue.add('lexos-order-create', body ?? {}, {
      jobId: `lexos-order-create:${lexosOrderId}`,
    });

    console.info(
      `[lexos-order-create] enfileirado — jobId=${job.id} lexosOrderId=${lexosOrderId}`,
    );

    // Responde imediatamente (Lexos aguarda 200 rápido)
    return NextResponse.json(
      { received: true, jobId: job.id, lexosOrderId },
      { status: 202 },
    );
  } catch (err) {
    console.error(`[lexos-order-create] erro interno — IP: ${ip}`, err);
    return NextResponse.json(
      { error: 'Erro interno ao enfileirar job', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
