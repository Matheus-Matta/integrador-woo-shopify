import { Worker, Job, Queue } from 'bullmq';
import { AxiosError } from 'axios';
import { config } from '../config';
import { logEmitter, QueueEvent } from '../services/emitter';
import { logError } from '../services/logger';
import { ordersQueue, productsQueue } from './queues';
import { connectMongo, NotificationScheduleModel, NotificationTemplateModel } from '../db/mongo';
import { broadcastPush, sendPushToUser } from '../services/pushNotifications';
import {
  handleShopCustomerCreate,
  handleShopCustomerUpdate,
  handleShopOrderCreate,
  handleShopOrderUpdate,
  handleWooOrderUpdate,
} from './handlers/order-handlers';
import { handleWooProduct } from './handlers/product-handlers';
import { handleOrderAudit, handleProductRecentAudit, handleProductFullAudit } from './handlers/audit-handlers';
import { handleLexosOrderCreate, handleLexosOrderUpdate } from './handlers/lexos-order-handlers';
import { handleShopProductToLexos } from './handlers/lexos-product-handlers';
import { withOrderLock } from '../services/orderLock';

function redisConnectionFromUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname || '127.0.0.1',
    port: u.port ? Number(u.port) : 6379,
    password: u.password || undefined,
    db: u.pathname ? Number(u.pathname.replace('/', '')) || 0 : 0,
  };
}

const connection = redisConnectionFromUrl(config.redis.url);

// Número máximo de tentativas por job (controlado manualmente — não pelo BullMQ).
// Cada falha recoloca o job no FIM da fila até atingir este limite.
const MAX_ATTEMPTS = config.queue.attempts;

function emitQueue(event: Omit<QueueEvent, 'ts'>) {
  logEmitter.emit('queue', { ...event, ts: new Date().toISOString() } as QueueEvent);
}

// ─── Worker Fila 1: orders (concurrency=1 = sequencial) ───────────────────

const ordersWorker = new Worker(
  'orders',
  async (job: Job) => {
    // Extrai contador de tentativas do payload (não deve chegar ao handler)
    const { _retryCount: _rc, ...payload } = job.data as Record<string, unknown>;
    const attempt = Number(_rc ?? 0) + 1;

    emitQueue({ queue: 'orders', jobName: job.name, status: 'active', jobId: job.id });
    console.log(`[Worker] orders/${job.name} iniciado (tentativa ${attempt}/${MAX_ATTEMPTS}) — jobId=${job.id}`);

    switch (job.name) {
      case 'shop-customer-create':
        await handleShopCustomerCreate(payload);
        break;
      case 'shop-customer-update':
        await handleShopCustomerUpdate(payload);
        break;
      case 'shop-order-create': {
        // Lock por orderId: garante que create e update do mesmo pedido não rodam em paralelo
        const orderId = String((payload as any)?.id ?? '');
        await withOrderLock(orderId || `no-id-${job.id}`, () => handleShopOrderCreate(payload));
        break;
      }
      case 'shop-order-update': {
        const orderId = String((payload as any)?.id ?? '');
        await withOrderLock(orderId || `no-id-${job.id}`, () => handleShopOrderUpdate(payload));
        break;
      }
      case 'woo-order-update':
        await handleWooOrderUpdate(payload);
        break;
      case 'order-audit':
        await handleOrderAudit();
        break;
      case 'lexos-order-create':
        await handleLexosOrderCreate(payload);
        break;
      case 'lexos-order-update':
        await handleLexosOrderUpdate(payload);
        break;
      default:
        throw new Error(`Job desconhecido na fila orders: ${job.name}`);    }
  },
  { connection, concurrency: 1 },
);

// ─── Worker Fila 2: products (concurrency=1 = sequencial) ─────────────────

const productsWorker = new Worker(
  'products',
  async (job: Job) => {
    const { _retryCount: _rc, ...payload } = job.data as Record<string, unknown>;
    const attempt = Number(_rc ?? 0) + 1;

    emitQueue({ queue: 'products', jobName: job.name, status: 'active', jobId: job.id });
    console.log(`[Worker] products/${job.name} iniciado (tentativa ${attempt}/${MAX_ATTEMPTS}) — jobId=${job.id}`);

    switch (job.name) {
      case 'woo-product':
        await handleWooProduct(payload);
        break;
      case 'product-recent-audit':
        await handleProductRecentAudit();
        break;
      case 'product-full-audit':
        await handleProductFullAudit();
        break;
      case 'shop-product-to-lexos':
        await handleShopProductToLexos(payload);
        break;
      default:
        throw new Error(`Job desconhecido na fila products: ${job.name}`);
    }
  },
  { connection, concurrency: 1 },
);

// ─── Worker Fila 3: notifications ─────────────────────────────────────────

const notificationsWorker = new Worker(
  'notifications',
  async (job: Job) => {
    const { scheduleId } = job.data as { scheduleId: string };
    console.log(`[Worker] notifications/push — scheduleId=${scheduleId} — jobId=${job.id}`);

    await connectMongo();

    const schedule = await NotificationScheduleModel.findById(scheduleId).lean();
    if (!schedule || !schedule.active) {
      console.log(`[Worker] notifications — agendamento inativo/não encontrado, ignorando`);
      return;
    }

    const template = await NotificationTemplateModel.findById(schedule.templateId).lean();
    if (!template) throw new Error(`Template ${String(schedule.templateId)} não encontrado`);

    const data = (template.url as string) ? { url: template.url as string } : undefined;

    if (schedule.mode === 'broadcast') {
      const result = await broadcastPush(template.title as string, template.body as string, data, 'schedule-broadcast');
      console.log(`[Worker] notifications — broadcast concluído para ${result.sent} dispositivo(s)`);
    } else if (schedule.userId) {
      const result = await sendPushToUser(schedule.userId as string, template.title as string, template.body as string, data, 'schedule');
      console.log(`[Worker] notifications — individual concluído: sent=${result.sent}`);
    }
  },
  { connection, concurrency: 2 }
);

notificationsWorker.on('completed', (job: Job) => {
  console.log(`[Worker] notifications/${job.name} concluído ✓ — jobId=${job.id}`);
});

notificationsWorker.on('failed', (job: Job | undefined, err: Error) => {
  console.error(`[Worker] notifications/${job?.name ?? 'unknown'} FALHOU — ${err.message}`);
});

// ─── Eventos dos workers ───────────────────────────────────────────────────

interface WorkerEntry {
  worker: Worker;
  queue: Queue;
  name: 'orders' | 'products';
}

const workerEntries: WorkerEntry[] = [
  { worker: ordersWorker,   queue: ordersQueue,   name: 'orders' },
  { worker: productsWorker, queue: productsQueue, name: 'products' },
];

for (const { worker, queue, name } of workerEntries) {
  worker.on('completed', (job: Job) => {
    const attempt = Number((job.data as Record<string, unknown>)._retryCount ?? 0) + 1;
    emitQueue({ queue: name, jobName: job.name, status: 'completed', jobId: job.id });
    console.log(`[Worker] ${name}/${job.name} concluído ✓ (tentativa ${attempt}/${MAX_ATTEMPTS}) — jobId=${job.id}`);
  });

  // Retry manual: job falho vai para o FIM da fila.
  // Só registra logError definitivo quando esgota MAX_ATTEMPTS.
  worker.on('failed', (job: Job | undefined, err: Error) => {
    if (!job) {
      console.error(`[Worker] ${name}/unknown FALHOU sem contexto de job — ${err.message}`);
      return;
    }

    const attempt = Number((job.data as Record<string, unknown>)._retryCount ?? 0) + 1;

    let errorMessage = err.message;
    if (err instanceof AxiosError && err.response?.data) {
      const data = err.response.data;
      const details = typeof data === 'object' ? JSON.stringify(data) : String(data);
      errorMessage = `${err.message} — Resposta: ${details}`;
    }

    emitQueue({ queue: name, jobName: job.name, status: 'failed', jobId: job.id, error: errorMessage });
    console.error(`[Worker] ${name}/${job.name} FALHOU (tentativa ${attempt}/${MAX_ATTEMPTS}) — jobId=${job.id} — ${errorMessage}`);

    if (attempt < MAX_ATTEMPTS) {
      // Re-enfileira no FIM da fila com contador incrementado
      const retryData = { ...(job.data as Record<string, unknown>), _retryCount: attempt };
      queue.add(job.name, retryData).then((retryJob) => {
        console.warn(`[Worker] ${name}/${job.name} agendado para retentativa ${attempt + 1}/${MAX_ATTEMPTS} — novo jobId=${retryJob.id}`);
      }).catch((enqueueErr: Error) => {
        console.error(`[Worker] ${name}/${job.name} falhou ao re-enfileirar — ${enqueueErr.message}`);
        const entity = deriveEntity(job.name, job.data as Record<string, unknown>);
        logError({
          flow: job.name,
          error_message: `Falha ao re-enfileirar após tentativa ${attempt}: ${enqueueErr.message}`,
          stack: enqueueErr.stack,
          payload: job.data,
          ...entity,
        }).catch(() => {});
      });
    } else {
      // Esgotou todas as tentativas — registra erro definitivo
      console.error(`[Worker] ${name}/${job.name} ESGOTOU ${MAX_ATTEMPTS} tentativas — registrando erro definitivo`);
      const entity = deriveEntity(job.name, job.data as Record<string, unknown>);
      logError({
        flow: job.name,
        error_message: `[${MAX_ATTEMPTS}/${MAX_ATTEMPTS} tentativas] ${err.message}`,
        stack: err.stack,
        payload: job.data,
        ...entity,
      }).catch(() => {});
    }
  });
}

export function startWorkers() {
  console.log('[Queue] Workers iniciados: orders (concurrency=1), products (concurrency=1), notifications (concurrency=2)');
}

export { ordersWorker, productsWorker, notificationsWorker };

// ─── Utils: extrair entidade básica do job.data ────────────────────────────

function deriveEntity(jobName: string, data: Record<string, unknown>): {
  entity_type?: 'order' | 'product' | 'customer';
  entity_id?: string;
  shopify_order_id?: string;
  woo_order_id?: number;
  email?: string;
  sku?: string;
} {
  const lower = jobName.toLowerCase();
  if (lower.includes('order')) {
    const id = String((data?.id ?? data?.shopifyOrderId ?? '') || '').trim();
    const wooId = Number((data as any)?.wooOrderId ?? (data as any)?.woo_order_id ?? 0) || undefined;
    return {
      entity_type: 'order',
      entity_id: id || undefined,
      shopify_order_id: id || undefined,
      woo_order_id: wooId,
    };
  }
  if (lower.includes('product')) {
    const sku = String((data as any)?.sku ?? '').trim();
    return { entity_type: 'product', entity_id: sku || undefined, sku: sku || undefined };
  }
  if (lower.includes('customer')) {
    const email = String((data as any)?.email ?? '').trim();
    return { entity_type: 'customer', entity_id: email || undefined, email: email || undefined };
  }
  return {};
}
