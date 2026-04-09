import { Queue } from 'bullmq';
import { config } from '../config';

// Parseia a URL do Redis para extrair auth/host/port/db
function redisConnectionFromUrl(url: string) {
  // redis://:password@host:port/db
  const u = new URL(url);
  return {
    host: u.hostname || '127.0.0.1',
    port: u.port ? Number(u.port) : 6379,
    password: u.password || undefined,
    db: u.pathname ? Number(u.pathname.replace('/', '')) || 0 : 0,
  };
}

const connection = redisConnectionFromUrl(config.redis.url);

const defaultJobOptions = {
  // Retentativas controladas manualmente no worker (job falho vai para o FIM da fila).
  // attempts=1 impede o BullMQ de retentar automaticamente com backoff.
  attempts: 1,
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 1000, age: 60 * 60 * 24 * 7 }, // mantém até 1 000 falhas por até 7 dias
};

// Fila 1 — pedidos e clientes (orders/create, orders/updated, customers/update)
export const ordersQueue = new Queue('orders', {
  connection,
  defaultJobOptions,
});

// Fila 2 — produtos (woo product.updated)
export const productsQueue = new Queue('products', {
  connection,
  defaultJobOptions,
});
