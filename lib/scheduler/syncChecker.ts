/**
 * Scheduler de Verificação de Sincronização
 * ──────────────────────────────────────────
 * Rodado em intervalo configurável.
 * 
 * Agora delega a execução pesada para as filas BullMQ, tornando o fluxo
 * 100% assíncrono e permitindo que múltiplos scans ocorram em paralelo.
 */
import { ordersQueue, productsQueue } from '../queue/queues';
import { logError } from '../services/logger';
import { config } from '../config';

/** Dispara auditoria de pedidos e produtos recentes (lookback) */
export async function runSyncCheck(): Promise<void> {
  try {
    console.log(`[Scheduler] ▶ Enfileirando auditorias recentes (lookback=${config.scheduler.lookbackHours}h)`);
    
    await Promise.all([
      ordersQueue.add('order-audit', {}, { 
        jobId: `audit-order-cycle-${Date.now()}`,
        removeOnComplete: true 
      }),
      productsQueue.add('product-recent-audit', {}, { 
        jobId: `audit-product-recent-cycle-${Date.now()}`,
        removeOnComplete: true 
      })
    ]);

    console.log('[Scheduler] ✓ Auditorias enfileiradas com sucesso.');
  } catch (err) {
    console.error('[Scheduler] Erro ao enfileirar auditorias:', err);
    await logError({ flow: 'scheduler', error_message: (err as Error).message });
  }
}

/** Dispara a auditoria completa diária de produtos */
export async function runDailySync(): Promise<void> {
  try {
    console.log('[Scheduler] ▶ Enfileirando auditoria COMPLETA diária de produtos');
    
    await productsQueue.add('product-full-audit', {}, {
      jobId: `audit-product-full-cycle-${Date.now()}`,
      removeOnComplete: true
    });

    console.log('[Scheduler] ✓ Auditoria completa enfileirada.');
  } catch (err) {
    console.error('[Scheduler] Erro ao enfileirar auditoria diária:', err);
    await logError({ flow: 'scheduler-daily', error_message: (err as Error).message });
  }
}

// ─── Inicialização ─────────────────────────────────────────────────────────

let _timer: ReturnType<typeof setInterval> | null = null;

export function startSyncScheduler(): void {
  if (_timer) return;
  if (!config.scheduler.active) {
    console.log('[Scheduler] Inativo na configuração. Pulando inicialização.');
    return;
  }

  console.log(`[Scheduler] Iniciado — intervalo=${config.scheduler.intervalMs / 60000} min, lookback=${config.scheduler.lookbackHours}h`);

  // Primeira execução após 1 min
  const firstRun = setTimeout(() => {
    void runSyncCheck();
  }, 60_000);
  firstRun.unref();

  _timer = setInterval(() => {
    void runSyncCheck();
  }, config.scheduler.intervalMs);
  _timer.unref();

  // Scheduler Diário
  if (config.productDailySync.active) {
    console.log(`[Scheduler] Daily Sync agendado para as ${config.productDailySync.hour}:${config.productDailySync.minute}`);
    const dailyInterval = setInterval(() => {
      const now = new Date();
      if (now.getHours() === config.productDailySync.hour && now.getMinutes() === config.productDailySync.minute) {
        void runDailySync();
      }
    }, 60_000);
    dailyInterval.unref();
  }
}

export function stopSyncScheduler(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    console.log('[Scheduler] Parado.');
  }
}

export function restartSyncScheduler(): void {
  console.log('[Scheduler] Reiniciando devido a atualização de configuração...');
  stopSyncScheduler();
  startSyncScheduler();
}
