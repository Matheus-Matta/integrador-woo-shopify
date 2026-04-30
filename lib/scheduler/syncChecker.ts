/**
 * Scheduler de Verificação de Sincronização
 * ──────────────────────────────────────────
 * Rodado em intervalo configurável (padrão: a cada 30 minutos).
 *
 * Fluxo:
 *  1. Pedidos  — busca os N pedidos mais recentes na Shopify que tenham
 *                _shopify_order_id no WooCommerce. Compara status. Se divergir
 *                ou o pedido não existir no Woo, re-enfileira shop-order-create
 *                ou shop-order-update conforme o caso.
 *
 *  2. Produtos — busca os N produtos recentes no WooCommerce e compara preço +
 *                estoque com o que está na Shopify (via SKU). Se divergir,
 *                re-enfileira woo-product.
 *
 * A janela de verificação é controlada por SCHEDULER_LOOKBACK_HOURS (padrão 2h).
 */
import { ordersQueue, productsQueue } from '../queue/queues';
import { logError } from '../services/logger';
import {
  getRecentShopifyOrders,
  getRecentShopifyProducts,
} from '../services/shopify';
import {
  getRecentWooOrders,
  getRecentWooProducts,
  WooInstance,
} from '../services/woocommerce';
import { config } from '../config';

// ─── Config ────────────────────────────────────────────────────────────────

const MAX_ORDERS      = 50;
const MAX_PRODUCTS    = 100;
const WOO_INSTANCE: WooInstance = 'starseguro';

// ─── Helpers ───────────────────────────────────────────────────────────────

function lookbackDate(): string {
  return new Date(Date.now() - config.scheduler.lookbackHours * 60 * 60 * 1000).toISOString();
}

/** Extrai _shopify_order_id de um meta_data do WooCommerce. */
function getShopifyIdFromMeta(meta: { key: string; value: unknown }[]): string {
  return String(meta.find((m) => m.key === '_shopify_order_id')?.value ?? '');
}

// ─── Check 1: Pedidos ──────────────────────────────────────────────────────

async function checkOrders(): Promise<{ total: number; requeued: number; errors: number }> {
  const since = lookbackDate();
  let requeued = 0;
  let errors = 0;

  // Pega pedidos recentes da Shopify
  const shopifyPage = await getRecentShopifyOrders(MAX_ORDERS);
  const shopifyOrders = shopifyPage.data?.orders?.edges?.map((e) => e.node) ?? [];

  // Pega pedidos recentes do WooCommerce com _shopify_order_id
  const wooOrders = await getRecentWooOrders(WOO_INSTANCE, 1, MAX_ORDERS, since);

  // Monta índice: shopify_order_id → woo order
  const wooByShopifyId = new Map<string, (typeof wooOrders)[0]>();
  for (const wo of wooOrders) {
    const sid = getShopifyIdFromMeta(wo.meta_data ?? []);
    if (sid) wooByShopifyId.set(sid, wo);
  }

  for (const shopifyOrder of shopifyOrders) {
    // Só verifica pedidos dentro da janela de lookback
    const updatedAt = new Date(shopifyOrder.updatedAt ?? shopifyOrder.createdAt);
    if (updatedAt < new Date(since)) continue;

    const shopifyId = shopifyOrder.id.replace('gid://shopify/Order/', '');

    try {
      const wooOrder = wooByShopifyId.get(shopifyId);

      if (!wooOrder) {
        // Pedido existe na Shopify mas NÃO existe no Woo → re-cria
        console.log(`[Scheduler] Pedido Shopify ${shopifyOrder.name} (${shopifyId}) não encontrado no Woo → re-enfileirando shop-order-create`);
        await ordersQueue.add('shop-order-create', {
          id: shopifyId,
          name: shopifyOrder.name,
          email: shopifyOrder.email,
          contact_email: shopifyOrder.email,
          admin_graphql_api_id: shopifyOrder.id,
          _scheduler_requeue: true,
          _scheduler_reason: 'missing_in_woo',
        });
        requeued++;
        continue;
      }

      // Verifica divergência de status
      const shopifyFinancial = shopifyOrder.displayFinancialStatus?.toLowerCase() ?? '';
      const wooStatus = wooOrder.status?.toLowerCase() ?? '';

      const statusMismatch = checkStatusMismatch(shopifyFinancial, wooStatus);
      if (statusMismatch) {
        console.log(
          `[Scheduler] Pedido ${shopifyOrder.name} — status divergente: Shopify=${shopifyFinancial} Woo=${wooStatus} → re-enfileirando shop-order-update`,
        );
        await ordersQueue.add('shop-order-update', {
          id: shopifyId,
          name: shopifyOrder.name,
          email: shopifyOrder.email,
          contact_email: shopifyOrder.email,
          admin_graphql_api_id: shopifyOrder.id,
          financial_status: shopifyOrder.displayFinancialStatus,
          fulfillment_status: shopifyOrder.displayFulfillmentStatus,
          _scheduler_requeue: true,
          _scheduler_reason: `status_mismatch:shopify=${shopifyFinancial},woo=${wooStatus}`,
        });
        requeued++;
      }
    } catch (err) {
      errors++;
      console.error(`[Scheduler] Erro ao verificar pedido ${shopifyOrder.name}:`, (err as Error).message);
      await logError({
        flow: 'scheduler-order-check',
        error_message: (err as Error).message,
        payload: { shopifyOrderId: shopifyId, name: shopifyOrder.name },
      });
    }
  }

  return { total: shopifyOrders.length, requeued, errors };
}

/**
 * Retorna true se o status do Shopify e do Woo são claramente incompatíveis.
 * Evita falsos positivos: ignora estados que são equivalentes (ex: paid = processing).
 */
function checkStatusMismatch(shopifyFinancial: string, wooStatus: string): boolean {
  // Shopify PAID → Woo deveria ser processing, completed, on-hold ou similar
  if (shopifyFinancial === 'paid' && wooStatus === 'pending') return true;
  // Shopify REFUNDED → Woo deveria ser refunded ou cancelled
  if (shopifyFinancial === 'refunded' && !['refunded', 'cancelled'].includes(wooStatus)) return true;
  // Shopify VOIDED → Woo deveria ser cancelled
  if (shopifyFinancial === 'voided' && wooStatus !== 'cancelled') return true;
  return false;
}

// ─── Check 2: Produtos ─────────────────────────────────────────────────────

async function checkProducts(): Promise<{ total: number; requeued: number; errors: number }> {
  const since = lookbackDate();
  let requeued = 0;
  let errors = 0;

  // Pega produtos recentes do WooCommerce como fonte de verdade
  const wooProducts = await getRecentWooProducts(WOO_INSTANCE, 1, MAX_PRODUCTS, since);

  // Pega variantes da Shopify para comparar
  const shopifyPage = await getRecentShopifyProducts(MAX_PRODUCTS);
  const shopifyVariants = shopifyPage.data?.productVariants?.edges?.map((e) => e.node) ?? [];

  // Monta índice: sku → shopify variant
  const shopifyBySku = new Map<string, (typeof shopifyVariants)[0]>();
  for (const v of shopifyVariants) {
    if (v.sku) shopifyBySku.set(v.sku.trim(), v);
  }

  for (const wooProd of wooProducts) {
    if (!wooProd.sku) continue;

    const shopifyVariant = shopifyBySku.get(wooProd.sku.trim());
    if (!shopifyVariant) continue; // SKU não está na Shopify — não é responsabilidade deste integrador

    try {
      const wooPriceFinal = wooProd.sale_price || wooProd.regular_price;
      const shopifyPrice = shopifyVariant.price;
      const shopifyQty = shopifyVariant.inventoryQuantity ?? 0;
      const wooQty = wooProd.stock_quantity ?? 0;

      const priceMismatch = Number(wooPriceFinal) !== Number(shopifyPrice);
      const stockMismatch = wooQty !== shopifyQty;

      if (priceMismatch || stockMismatch) {
        console.log(
          `[Scheduler] Produto SKU=${wooProd.sku} divergente —` +
          (priceMismatch ? ` preço Woo=${wooPriceFinal} Shopify=${shopifyPrice}` : '') +
          (stockMismatch ? ` estoque Woo=${wooQty} Shopify=${shopifyQty}` : '') +
          ' → re-enfileirando woo-product',
        );
        await productsQueue.add('woo-product', {
          sku: wooProd.sku,
          name: wooProd.name,
          stock_quantity: wooQty,
          regular_price: wooProd.regular_price,
          sale_price: wooProd.sale_price,
          _scheduler_requeue: true,
          _scheduler_reason: [
            priceMismatch ? `price_mismatch:woo=${wooPriceFinal},shopify=${shopifyPrice}` : '',
            stockMismatch ? `stock_mismatch:woo=${wooQty},shopify=${shopifyQty}` : '',
          ].filter(Boolean).join('|'),
        });
        requeued++;
      }
    } catch (err) {
      errors++;
      console.error(`[Scheduler] Erro ao verificar produto SKU=${wooProd.sku}:`, (err as Error).message);
      await logError({
        flow: 'scheduler-product-check',
        error_message: (err as Error).message,
        payload: { sku: wooProd.sku },
      });
    }
  }

  return { total: wooProducts.length, requeued, errors };
}

// ─── Runner principal ──────────────────────────────────────────────────────

async function runSyncCheck(): Promise<void> {
  const start = Date.now();
  console.log(`[Scheduler] ▶ Verificação de sincronização iniciada (lookback=${config.scheduler.lookbackHours}h)`);

  try {
    const [ordersResult, productsResult] = await Promise.allSettled([
      checkOrders(),
      checkProducts(),
    ]);

    const ordersStats = ordersResult.status === 'fulfilled'
      ? ordersResult.value
      : { total: 0, requeued: 0, errors: 1 };

    const productsStats = productsResult.status === 'fulfilled'
      ? productsResult.value
      : { total: 0, requeued: 0, errors: 1 };

    if (ordersResult.status === 'rejected') {
      console.error('[Scheduler] Falha geral no check de pedidos:', ordersResult.reason);
      await logError({ flow: 'scheduler-orders', error_message: String(ordersResult.reason) });
    }
    if (productsResult.status === 'rejected') {
      console.error('[Scheduler] Falha geral no check de produtos:', productsResult.reason);
      await logError({ flow: 'scheduler-products', error_message: String(productsResult.reason) });
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
      `[Scheduler] ✓ Concluído em ${elapsed}s — ` +
      `pedidos: ${ordersStats.total} verificados, ${ordersStats.requeued} re-enfileirados, ${ordersStats.errors} erros | ` +
      `produtos: ${productsStats.total} verificados, ${productsStats.requeued} re-enfileirados, ${productsStats.errors} erros`,
    );
  } catch (err) {
    console.error('[Scheduler] Erro inesperado no ciclo de verificação:', err);
    await logError({ flow: 'scheduler', error_message: (err as Error).message });
  }
}

// ─── Inicialização ─────────────────────────────────────────────────────────

let _timer: ReturnType<typeof setInterval> | null = null;

export function startSyncScheduler(): void {
  if (_timer) return; // já iniciado
  if (!config.scheduler.active) {
    console.log('[Scheduler] Inativo na configuração. Pulando inicialização.');
    return;
  }

  console.log(`[Scheduler] Iniciado — intervalo=${config.scheduler.intervalMs / 60000} min, lookback=${config.scheduler.lookbackHours}h`);

  // Primeira execução após 1 min (dar tempo ao servidor de subir)
  const firstRun = setTimeout(() => {
    void runSyncCheck();
  }, 60_000);
  firstRun.unref();

  _timer = setInterval(() => {
    void runSyncCheck();
  }, config.scheduler.intervalMs);
  _timer.unref(); // não bloqueia o encerramento do processo
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
