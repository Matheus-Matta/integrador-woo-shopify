/**
 * Flow 6 — Order Update WooCommerce → Shopify
 * Recebe webhook, valida HMAC, enfileira na fila 'orders' e retorna 202.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyWooHmac, getRawBody } from '../utils/webhook-validator';
import { ordersQueue } from '../queue/queues';
import { logError } from '../services/logger';

export async function wooOrderUpdateRoute(app: FastifyInstance): Promise<void> {
  app.post(
    '/webhook/woo-order-update',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sig = request.headers['x-wc-webhook-signature'] as string;
      if (!verifyWooHmac(getRawBody(request), sig)) {
        request.log.warn({ sig, ip: request.ip }, '[woo-order-update] HMAC inválido — assinatura rejeitada');
        void logError({ flow: 'woo-order-update', error_message: 'HMAC inválido', payload: { sig: sig ?? '(vazio)', ip: request.ip } });
        return reply.status(401).send({ error: 'Assinatura invalida' });
      }

      const raw = request.body as Record<string, unknown>;
      const body = (raw?.body ?? raw) as Record<string, unknown>;

      try {
        const job = await ordersQueue.add('woo-order-update', body);
        request.log.info({ jobId: job.id }, '[woo-order-update] webhook enfileirado com sucesso');
        return reply.status(202).send({ queued: true, jobId: job.id });
      } catch (err) {
        request.log.error({ err }, 'Erro ao enfileirar woo-order-update');
        return reply.status(500).send({ error: 'Erro interno ao enfileirar job', detail: (err as Error).message });
      }
    },
  );
}
