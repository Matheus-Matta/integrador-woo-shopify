import { Worker, Job } from 'bullmq';
import { config } from '../config';
import { logEmitter, QueueEvent } from '../services/emitter';
import { logError } from '../services/logger';
import {
  handleShopCustomerCreate,
  handleShopCustomerUpdate,
  handleShopOrderCreate,
  handleShopOrderUpdate,
  handleWooOrderUpdate,
} from './handlers/order-handlers';
import { handleWooProduct } from './handlers/product-handlers';

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

function emitQueue(event: Omit<QueueEvent, 'ts'>) {
  logEmitter.emit('queue', { ...event, ts: new Date().toISOString() } as QueueEvent);
}

// ─── Worker Fila 1: orders (concurrency=1 = sequencial) ───────────────────

const ordersWorker = new Worker(
  'orders',
  async (job: Job) => {
    emitQueue({ queue: 'orders', jobName: job.name, status: 'active', jobId: job.id });
    console.log(`[Worker] orders/${job.name} iniciado — jobId=${job.id}`);

    const payload = job.data as Record<string, unknown>;

    switch (job.name) {
      case 'shop-customer-create':
        await handleShopCustomerCreate(payload);
        break;
      case 'shop-customer-update':
        await handleShopCustomerUpdate(payload);
        break;
      case 'shop-order-create':
        await handleShopOrderCreate(payload);
        break;
      case 'shop-order-update':
        await handleShopOrderUpdate(payload);
        break;
      case 'woo-order-update':
        await handleWooOrderUpdate(payload);
        break;
      default:
        throw new Error(`Job desconhecido na fila orders: ${job.name}`);
    }
  },
  { connection, concurrency: 1 },
);

// ─── Worker Fila 2: products (concurrency=1 = sequencial) ─────────────────

const productsWorker = new Worker(
  'products',
  async (job: Job) => {
    emitQueue({ queue: 'products', jobName: job.name, status: 'active', jobId: job.id });
    console.log(`[Worker] products/${job.name} iniciado — jobId=${job.id}`);

    switch (job.name) {
      case 'woo-product':
        await handleWooProduct(job.data);
        break;
      default:
        throw new Error(`Job desconhecido na fila products: ${job.name}`);
    }
  },
  { connection, concurrency: 1 },
);

// ─── Eventos dos workers ───────────────────────────────────────────────────

for (const [worker, queueName] of [
  [ordersWorker, 'orders'],
  [productsWorker, 'products'],
] as const) {
  worker.on('completed', (job: Job) => {
    emitQueue({ queue: queueName as 'orders' | 'products', jobName: job.name, status: 'completed', jobId: job.id });
    console.log(`[Worker] ${queueName}/${job.name} concluído ✓ — jobId=${job.id}`);
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    emitQueue({
      queue: queueName as 'orders' | 'products',
      jobName: job?.name ?? 'unknown',
      status: 'failed',
      jobId: job?.id,
      error: err.message,
    });
    console.error(`[Worker] ${queueName}/${job?.name ?? 'unknown'} FALHOU — jobId=${job?.id} — ${err.message}`);

    logError({
      flow: job?.name ?? queueName,
      error_message: err.message,
      stack: err.stack,
      payload: job?.data,
    }).catch(() => {});
  });
}

export function startWorkers() {
  console.log('[Queue] Workers iniciados: orders (concurrency=1), products (concurrency=1)');
}

export { ordersWorker, productsWorker };
