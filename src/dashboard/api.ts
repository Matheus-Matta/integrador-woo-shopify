/**
 * Dashboard — API REST para logs e estatísticas de filas
 */
import { FastifyInstance, FastifyRequest } from 'fastify';
import { Model } from 'mongoose';
import {
  LogProductModel,
  LogCustomerModel,
  LogOrderModel,
  LogErrorModel,
} from '../db/mongo';
import { ordersQueue, productsQueue } from '../queue/queues';
import { config } from '../config';

type LogsQuery = {
  type?: 'product' | 'customer' | 'order' | 'error';
  page?: string;
  limit?: string;
  search?: string;
  status?: string;
  action?: string;
  from?: string;
  to?: string;
};

const MODEL_MAP: Record<string, Model<unknown>> = {
  product: LogProductModel as Model<unknown>,
  customer: LogCustomerModel as Model<unknown>,
  order: LogOrderModel as Model<unknown>,
  error: LogErrorModel as Model<unknown>,
} as const;

/** Escapa caracteres especiais de regex para evitar ReDoS. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Constrói o filtro MongoDB a partir dos parâmetros da query. */
function buildFilter(type: string, query: LogsQuery): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  // Filtro de status (não se aplica à aba de erros — todos já são erros)
  if (query.status && type !== 'error' && ['success', 'error', 'skipped'].includes(query.status)) {
    filter.status = query.status;
  }

  // Filtro de ação
  if (query.action) {
    filter.action = query.action;
  }

  // Filtro de intervalo de datas
  if (query.from || query.to) {
    const dateFilter: Record<string, Date> = {};
    if (query.from) { const d = new Date(query.from); if (!isNaN(d.getTime())) dateFilter.$gte = d; }
    if (query.to)   { const d = new Date(query.to);   if (!isNaN(d.getTime())) { d.setHours(23, 59, 59, 999); dateFilter.$lte = d; } }
    if (Object.keys(dateFilter).length) filter.timestamp = dateFilter;
  }

  // Busca textual por campos relevantes por tipo
  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), 'i');
    if (type === 'order') {
      filter.$or = [
        { shopify_order_id: regex },
        { shopify_order_name: regex },
      ];
    } else if (type === 'customer') {
      filter.$or = [{ email: regex }];
    } else if (type === 'product') {
      filter.$or = [{ sku: regex }];
    } else if (type === 'error') {
      filter.$or = [{ flow: regex }, { error_message: regex }];
    }
  }

  return filter;
}

export async function dashboardApiRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /dashboard/api/logs
   * Query: type=product|customer|order|error  page=1  limit=50
   *        search=  status=success|error|skipped  action=  from=YYYY-MM-DD  to=YYYY-MM-DD
   */
  app.get<{ Querystring: LogsQuery }>(
    '/dashboard/api/logs',
    async (request: FastifyRequest<{ Querystring: LogsQuery }>, reply) => {
      const type = request.query.type ?? 'order';
      const page = Math.max(1, Number(request.query.page ?? 1));
      const limit = Math.min(200, Math.max(1, Number(request.query.limit ?? 50)));
      const skip = (page - 1) * limit;

      const Model = MODEL_MAP[type];
      if (!Model) return reply.status(400).send({ error: 'Tipo inválido' });

      const filter = buildFilter(type, request.query);

      const [docs, total] = await Promise.all([
        Model.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
        Model.countDocuments(filter),
      ]);

      return reply.send({
        data: docs,
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      });
    },
  );

  /**
   * GET /dashboard/api/queue-stats
   * Retorna waiting/active/completed/failed/delayed para cada fila
   */
  app.get('/dashboard/api/queue-stats', async (_request, reply) => {
    const [orderCounts, productCounts] = await Promise.all([
      ordersQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      productsQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
    ]);

    return reply.send({
      orders: orderCounts,
      products: productCounts,
    });
  });

  /**
   * GET /dashboard/api/config
   * Retorna configs públicas do servidor (sem segredos)
   */
  app.get('/dashboard/api/config', async (_request, reply) => {
    return reply.send({
      domain: config.domain || null,
      queueAttempts: config.queue.attempts,
      queueBackoffMs: config.queue.backoffDelay,
      rateLimitMax: config.rateLimit.max,
      rateLimitWindowMs: config.rateLimit.windowMs,
    });
  });

  /**
   * POST /dashboard/api/queue/:name/retry-failed
   * Recoloca todos os jobs com falha de volta na fila
   */
  app.post<{ Params: { name: string } }>(
    '/dashboard/api/queue/:name/retry-failed',
    async (request, reply) => {
      const queue = request.params.name === 'orders' ? ordersQueue : productsQueue;
      if (!queue) return reply.status(400).send({ error: 'Fila inválida' });

      const failed = await queue.getFailed();
      await Promise.all(failed.map((job) => job.retry()));

      return reply.send({ retriedCount: failed.length });
    },
  );
}
