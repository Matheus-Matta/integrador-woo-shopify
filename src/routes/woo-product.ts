/**
 * Flow 1 — Produto WooCommerce → Shopify
 * Recebe webhook, valida HMAC, enfileira na fila 'products' e retorna 202.
 * A lógica de negócio está em src/queue/handlers/product-handlers.ts
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyWooHmac, getRawBody } from '../utils/webhook-validator';
import { productsQueue } from '../queue/queues';
import { logError } from '../services/logger';
import { s } from '../utils/helpers';

interface WooProductBody {
  body?: { sku?: string };
  sku?: string;
}

export async function wooProductRoute(app: FastifyInstance): Promise<void> {
  app.post(
    '/webhook/woo-product',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sig = request.headers['x-wc-webhook-signature'] as string;
      if (!verifyWooHmac(getRawBody(request), sig)) {
        request.log.warn({ sig, ip: request.ip }, '[woo-product] HMAC inválido — assinatura rejeitada');
        void logError({ flow: 'woo-product', error_message: 'HMAC inválido', payload: { sig: sig ?? '(vazio)', ip: request.ip } });
        return reply.status(401).send({ error: 'Assinatura inválida' });
      }

      const raw = request.body as WooProductBody;
      const sku = s(raw?.body?.sku ?? raw?.sku);
      if (!sku) return reply.status(400).send({ error: 'SKU obrigatório' });

      try {
        const job = await productsQueue.add('woo-product', raw);
        request.log.info({ jobId: job.id, sku }, '[woo-product] webhook enfileirado com sucesso');
        return reply.status(202).send({ queued: true, jobId: job.id, sku });
      } catch (err) {
        request.log.error({ err }, 'Erro ao enfileirar woo-product');
        return reply.status(500).send({ error: 'Erro interno ao enfileirar job', detail: (err as Error).message });
      }
    },
  );
}
