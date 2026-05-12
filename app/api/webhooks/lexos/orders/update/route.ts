import { NextRequest, NextResponse } from 'next/server';
import { ordersQueue } from '@/lib/queue/queues';
import { logError, logOrder } from '@/lib/services/logger';
import { deduplicateDelivery } from '@/lib/services/webhookDedup';
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
 */
function verifyLexosToken(req: NextRequest): boolean {
  const expected = s(config.lexos.webhookToken);

  if (!expected) {
    console.warn('[lexos-order-update] LEXOS_WEBHOOK_TOKEN não configurado — validação de token ignorada');
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
    webhook: 'lexos-order-update',
    route: '/api/webhooks/lexos/orders/update',
    method: 'POST',
    description: 'Recebe notificações de atualização de pedido do Lexos Hub',
  });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  console.log(`[lexos-order-update] POST recebido — IP: ${ip}`);

  try {
    const rawBody   = await req.text();
    const body      = parseBody(rawBody);

    const data       = (body?.data ?? body) as Record<string, unknown>;
    const lexosOrderId  = s(data?.pedido_id);
    const lexosOrderNum = s(data?.numero_pedido);

    const eventId = s(body?.event_id) || s(body?.id) || `update-${lexosOrderId}-${Date.now()}`;

    // ── Validação de token ────────────────────────────────────────────────
    if (!verifyLexosToken(req)) {
      console.warn(`[lexos-order-update] Token inválido — rejeitado IP: ${ip}`);
      await logError({
        flow: 'lexos-order-update',
        error_message: 'Token de webhook inválido',
        payload: { ip, eventId, lexosOrderId },
        entity_type: 'order',
        entity_id: lexosOrderId || undefined,
      });
      if (lexosOrderId) {
        await logOrder({
          shopify_order_id: lexosOrderId,
          shopify_order_name: lexosOrderNum,
          origin: 'lexos',
          action: 'webhook_rejected_invalid_token',
          webhook: body ?? undefined,
          payload: { reason: 'invalid-token', ip, eventId },
          status: 'skipped',
        });
      }
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    // ── Deduplicação por event_id ─────────────────────────────────────────
    if (eventId && eventId.indexOf('update-') !== 0) { // não deduplica se foi gerado o eventId fallback
      const isNew = await deduplicateDelivery(eventId);
      if (!isNew) {
        console.warn(`[lexos-order-update] event_id duplicado — descartado: ${eventId}`);
        await logOrder({
          shopify_order_id: lexosOrderId || undefined,
          shopify_order_name: lexosOrderNum,
          origin: 'lexos',
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
      console.warn('[lexos-order-update] pedido_id ausente no payload');
      await logError({
        flow: 'lexos-order-update',
        error_message: 'pedido_id ausente no payload',
        payload: body ?? {},
        entity_type: 'order',
      });
      return NextResponse.json({ error: 'pedido_id é obrigatório' }, { status: 400 });
    }

    // ── Enfileira o job ───────────────────────────────────────────────────
    const job = await ordersQueue.add('lexos-order-update', body ?? {}, {
      jobId: `lexos-order-update:${lexosOrderId}:${Date.now()}`,
    });

    console.info(
      `[lexos-order-update] enfileirado — jobId=${job.id} lexosOrderId=${lexosOrderId}`,
    );

    return NextResponse.json(
      { received: true, jobId: job.id, lexosOrderId },
      { status: 202 },
    );
  } catch (err) {
    console.error(`[lexos-order-update] erro interno — IP: ${ip}`, err);
    return NextResponse.json(
      { error: 'Erro interno ao enfileirar job', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
