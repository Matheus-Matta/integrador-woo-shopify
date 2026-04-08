import 'dotenv/config';
// Fuso horário deve ser definido antes de qualquer uso de Date
process.env.TZ = 'America/Sao_Paulo';
import { execSync } from 'child_process';
import { connectMongo } from './db/mongo';
import { connectRedis } from './db/redis';
import { buildServer } from './server';
import { startWorkers } from './queue/workers';
import { startSyncScheduler } from './scheduler/syncChecker';
import { config } from './config';

/** Encerra qualquer processo que esteja usando a porta informada. */
function freePort(port: number): void {
  try {
    if (process.platform === 'win32') {
      // Obtém os PIDs via netstat e mata cada um
      const out = execSync(
        `netstat -ano | findstr ":${port} " | findstr LISTENING`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] },
      );
      const pids = [...new Set(
        out.split('\n')
          .map((l) => l.trim().split(/\s+/).pop())
          .filter((p): p is string => !!p && /^\d+$/.test(p) && p !== '0'),
      )];
      for (const pid of pids) {
        try { execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' }); } catch { /* já encerrado */ }
      }
      if (pids.length) console.log(`[boot] Liberada porta ${port} (PID${pids.length > 1 ? 's' : ''}: ${pids.join(', ')})`);
    } else {
      execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: 'ignore' });
    }
  } catch {
    // Nenhum processo na porta — ok
  }
}

async function main() {
  try {
    // ── Libera a porta antes de subir ─────────────────────────────────────
    freePort(config.port);

    // ── Conecta ao MongoDB ────────────────────────────────────────────────
    await connectMongo();

    // ── Conecta ao Redis ──────────────────────────────────────────────────
    await connectRedis();

    // ── Inicia workers de fila ─────────────────────────────────────────────
    startWorkers();

    // ── Inicia scheduler de verificação ───────────────────────────────────
    startSyncScheduler();

    // ── Inicia o servidor ─────────────────────────────────────────────────
    const app = await buildServer();
    await app.listen({ port: config.port, host: '0.0.0.0' });

    console.log(`\n🚀 Integrador Shopify-WooCommerce rodando na porta ${config.port}`);
    console.log(`   POST /webhook/woo-product          (WooCommerce → Shopify: produto)`);
    console.log(`   POST /webhook/shop-customer-create (Shopify → WooCommerce: criar cliente)`);
    console.log(`   POST /webhook/shop-customer-update (Shopify → WooCommerce: atualizar cliente)`);
    console.log(`   POST /webhook/shop-order-create    (Shopify → WooCommerce: criar pedido)`);
    console.log(`   POST /webhook/shop-order-update    (Shopify → WooCommerce: atualizar pedido)`);
    console.log(`   POST /webhook/woo-order-update     (WooCommerce → Shopify: pedido concluído)`);
    console.log(`   GET  /health`);
    console.log(`   GET  /dashboard                    (Dashboard — autenticação por senha)\n`);

  } catch (err) {
    console.error('Erro fatal ao iniciar o servidor:', err);
    process.exit(1);
  }
}

main();
