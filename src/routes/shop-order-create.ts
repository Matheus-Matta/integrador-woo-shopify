/**
 * Flow 4 — Order Create Shopify → WooCommerce (shop-oc)
 * Recebe webhook, valida HMAC, enfileira na fila 'orders' e retorna 202.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyShopifyHmac, getRawBody } from '../utils/webhook-validator';
import { ordersQueue } from '../queue/queues';
import { logError } from '../services/logger';
import { s } from '../utils/helpers';
import { deduplicateDelivery, deduplicateOrder } from '../services/webhookDedup';

export async function shopOrderCreateRoute(app: FastifyInstance): Promise<void> {
  app.post(
    '/webhook/shop-order-create',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sig = request.headers['x-shopify-hmac-sha256'] as string;
      if (!verifyShopifyHmac(getRawBody(request), sig)) {
        request.log.warn({ sig, ip: request.ip }, '[shop-order-create] HMAC inválido — assinatura rejeitada');
        void logError({ flow: 'shop-order-create', error_message: 'HMAC inválido', payload: { sig: sig ?? '(vazio)', ip: request.ip } });
        return reply.status(401).send({ error: 'Assinatura invalida' });
      }

      const deliveryId = request.headers['x-shopify-delivery-id'] as string | undefined;
      if (deliveryId) {
        const isNew = await deduplicateDelivery(deliveryId);
        if (!isNew) {
          request.log.warn({ deliveryId }, '[shop-order-create] delivery-id duplicado — descartado');
          return reply.status(200).send({ skipped: true, reason: 'duplicate-delivery' });
        }
      }

      const raw = request.body as Record<string, unknown>;
      const order = (raw?.body ?? raw) as Record<string, unknown>;
      const email = s(order?.contact_email ?? order?.email);
      const shopifyOrderId = String(order?.id ?? '');
      if (!email || !shopifyOrderId) {
        return reply.status(400).send({ error: 'email e id do pedido sao obrigatorios' });
      }

      const isNewOrder = await deduplicateOrder('shop-order-create', shopifyOrderId);
      if (!isNewOrder) {
        request.log.warn({ shopifyOrderId }, '[shop-order-create] order duplicado na janela de 30s — descartado');
        return reply.status(200).send({ skipped: true, reason: 'duplicate-order' });
      }

      try {
        const job = await ordersQueue.add('shop-order-create', order);
        request.log.info({ jobId: job.id, shopifyOrderId }, '[shop-order-create] webhook enfileirado com sucesso');
        return reply.status(202).send({ queued: true, jobId: job.id, shopifyOrderId });
      } catch (err) {
        request.log.error({ err }, 'Erro ao enfileirar shop-order-create');
        return reply.status(500).send({ error: 'Erro interno ao enfileirar job', detail: (err as Error).message });
      }
    },
  );
}
