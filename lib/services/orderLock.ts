/**
 * Mutex por orderId — garante que apenas um job processa um pedido por vez.
 *
 * Problema resolvido:
 *   O Shopify dispara orders/create e orders/update quase simultaneamente.
 *   Mesmo com concurrency=1 na fila global, dois webhooks podem passar pela
 *   validação em paralelo (no servidor web) antes de chegar ao worker.
 *   O lock por orderId garante que se um create ainda está rodando,
 *   qualquer update do mesmo pedido aguarda — e vice-versa.
 *
 * Implementação:
 *   - SET NX EX no Redis: atômico, sem race conditions
 *   - Polling com backoff exponencial (max 30s de espera total)
 *   - Lock auto-expira após 120s (protege contra crashes do worker)
 *   - Sempre liberado no finally do worker
 */
import { redis } from '../db/redis';

const LOCK_TTL_SECONDS = 120;        // Tempo máximo que um job pode segurar o lock
const POLL_INTERVAL_MS = 200;        // Tempo entre tentativas de adquirir o lock
const MAX_WAIT_MS = 30_000;          // Espera máxima por um lock (30 segundos)

function lockKey(orderId: string): string {
  return `lock:order:${orderId}`;
}

/**
 * Adquire o lock para um orderId específico.
 * Faz polling até conseguir ou atingir MAX_WAIT_MS.
 * Retorna uma função `release()` para liberar o lock.
 */
export async function acquireOrderLock(orderId: string): Promise<() => Promise<void>> {
  const key = lockKey(orderId);
  const startTime = Date.now();
  let attempt = 0;

  while (true) {
    // SET NX EX — atômico: só define se não existir
    const result = await redis.set(key, '1', 'EX', LOCK_TTL_SECONDS, 'NX');

    if (result === 'OK') {
      // Lock adquirido!
      console.log(`[OrderLock] 🔒 Lock adquirido para pedido ${orderId} (tentativa ${attempt + 1})`);
      return async () => {
        await redis.del(key);
        console.log(`[OrderLock] 🔓 Lock liberado para pedido ${orderId}`);
      };
    }

    // Lock ocupado — verifica timeout
    const elapsed = Date.now() - startTime;
    if (elapsed >= MAX_WAIT_MS) {
      console.error(`[OrderLock] ⏰ Timeout aguardando lock do pedido ${orderId} após ${elapsed}ms`);
      // Mesmo com timeout, retorna uma função de release no-op para não quebrar o fluxo.
      // O job vai continuar (pode causar race condition de edge-case, mas é melhor do que travar).
      return async () => {};
    }

    attempt++;
    // Backoff exponencial suave: 200ms → 400ms → 800ms → max 2s
    const delay = Math.min(POLL_INTERVAL_MS * Math.pow(1.5, Math.min(attempt, 5)), 2_000);
    console.log(`[OrderLock] ⏳ Pedido ${orderId} bloqueado, aguardando ${Math.round(delay)}ms (tentativa ${attempt})...`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

/**
 * Executa uma função com lock exclusivo por orderId.
 * Garante que o lock é sempre liberado, mesmo em caso de erro.
 */
export async function withOrderLock<T>(
  orderId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const release = await acquireOrderLock(orderId);
  try {
    return await fn();
  } finally {
    await release();
  }
}
