export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Importa dinamicamente para evitar carregar bibliotecas Node no Edge Runtime
    const { connectMongo } = await import('./lib/db/mongo');
    const { startWorkers } = await import('./lib/queue/workers');
    const { startSyncScheduler } = await import('./lib/scheduler/syncChecker');

    try {
      await connectMongo();
      startWorkers();
      startSyncScheduler();
      console.log('[Instrumentation] Serviços de background inicializados com sucesso.');
    } catch (err) {
      console.error('[Instrumentation] Erro ao inicializar serviços de background:', err);
    }
  }
}
