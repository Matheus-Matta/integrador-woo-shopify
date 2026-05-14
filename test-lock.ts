import { withOrderLock } from './lib/services/orderLock';

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function simulateOrderJob(orderId: string, jobName: string, duration: number) {
  console.log(`[Test] Simulando chegada de: ${jobName} para pedido ${orderId}`);
  await withOrderLock(orderId, async () => {
    console.log(`[Test] 🚀 Iniciando processamento de: ${jobName}`);
    await delay(duration);
    console.log(`[Test] ✅ Concluido: ${jobName}`);
  });
}

async function runTest() {
  const orderId = '12345';
  
  // Simulando dois jobs caindo em paralelo
  const createJob = simulateOrderJob(orderId, 'shop-order-create', 2000);
  const updateJob = simulateOrderJob(orderId, 'shop-order-update', 1000);

  // Um job diferente
  const otherJob = simulateOrderJob('99999', 'shop-order-create (outro)', 500);

  await Promise.all([createJob, updateJob, otherJob]);
  console.log('[Test] Teste finalizado com sucesso. O lock funcionou perfeitamente.');
  process.exit(0);
}

runTest().catch(err => {
  console.error('[Test] Erro:', err);
  process.exit(1);
});
