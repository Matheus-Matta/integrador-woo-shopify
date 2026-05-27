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

const defaultJobOptions = {
  // Retentativas controladas manualmente no worker (job falho vai para o FIM da fila).
  // attempts=1 impede o BullMQ de retentar automaticamente com backoff.
  attempts: 1,
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 1000, age: 60 * 60 * 24 * 7 }, // mantém até 1 000 falhas por até 7 dias
};

// Lazy — criados na primeira chamada, não na avaliação do módulo
// Evita conexão ao Redis durante o next build (coleta de dados de página)
let _ordersQueue: Queue | undefined;
let _productsQueue: Queue | undefined;

function getConnection() {
  return redisConnectionFromUrl(config.redis.url);
}

export function getOrdersQueue(): Queue {
  if (!_ordersQueue) {
    _ordersQueue = new Queue('orders', { connection: getConnection(), defaultJobOptions });
  }
  return _ordersQueue;
}

export function getProductsQueue(): Queue {
  if (!_productsQueue) {
    _productsQueue = new Queue('products', { connection: getConnection(), defaultJobOptions });
  }
  return _productsQueue;
}

let _notificationsQueue: Queue | undefined;

export function getNotificationsQueue(): Queue {
  if (!_notificationsQueue) {
    _notificationsQueue = new Queue('notifications', {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 100 },
      },
    });
  }
  return _notificationsQueue;
}

// Re-exporta como getters para compatibilidade com imports existentes
export const ordersQueue = new Proxy({} as Queue, {
  get(_t, prop) { return (getOrdersQueue() as never)[prop as keyof Queue]; },
});

export const productsQueue = new Proxy({} as Queue, {
  get(_t, prop) { return (getProductsQueue() as never)[prop as keyof Queue]; },
});
