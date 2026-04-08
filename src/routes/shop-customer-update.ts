/**
 * Flow 3 — Customer Update Shopify → WooCommerce (shop-cup)
 * Recebe webhook, valida HMAC, enfileira na fila 'orders' e retorna 202.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyShopifyHmac, getRawBody } from '../utils/webhook-validator';
import { ordersQueue } from '../queue/queues';
import { logError } from '../services/logger';
import { s } from '../utils/helpers';
import { deduplicateDelivery } from '../services/webhookDedup';

export async function shopCustomerUpdateRoute(app: FastifyInstance): Promise<void> {
  app.post(
    '/webhook/shop-customer-update',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sig = request.headers['x-shopify-hmac-sha256'] as string;
      if (!verifyShopifyHmac(getRawBody(request), sig)) {
        request.log.warn({ sig, ip: request.ip }, '[shop-customer-update] HMAC inválido — assinatura rejeitada');
        void logError({ flow: 'shop-customer-update', error_message: 'HMAC inválido', payload: { sig: sig ?? '(vazio)', ip: request.ip } });
        return reply.status(401).send({ error: 'Assinatura invalida' });
      }

      const deliveryId = request.headers['x-shopify-delivery-id'] as string | undefined;
      if (deliveryId) {
        const isNew = await deduplicateDelivery(deliveryId);
        if (!isNew) {
          request.log.warn({ deliveryId }, '[shop-customer-update] delivery-id duplicado — descartado');
          return reply.status(200).send({ skipped: true, reason: 'duplicate-delivery' });
        }
      }

      const raw = request.body as Record<string, unknown>;
      const order = (raw?.body ?? raw) as Record<string, unknown>;
      const email = s(order?.contact_email ?? order?.email);
      if (!email) return reply.status(400).send({ error: 'Email obrigatorio' });

      try {
        const job = await ordersQueue.add('shop-customer-update', order);
        request.log.info({ jobId: job.id, email }, '[shop-customer-update] webhook enfileirado com sucesso');
        return reply.status(202).send({ queued: true, jobId: job.id, email });
      } catch (err) {
        request.log.error({ err }, 'Erro ao enfileirar shop-customer-update');
        return reply.status(500).send({ error: 'Erro interno ao enfileirar job', detail: (err as Error).message });
      }
    },
  );
}
