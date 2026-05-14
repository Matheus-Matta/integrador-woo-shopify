import { config } from '../../config';
import { productsQueue, ordersQueue } from '../queues';
import { getRecentWooOrders, getRecentWooProducts } from '../../services/woocommerce';
import { getRecentShopifyProducts, getProductBySku } from '../../services/shopify';
import { s, money } from '../../utils/helpers';

// ─── Auditoria de Pedidos Recentes ──────────────────────────────────────────

export async function handleOrderAudit(): Promise<void> {
  console.log(`[Audit] ▶ Iniciando auditoria de pedidos (lookback=${config.scheduler.lookbackHours}h)`);
  
  const startTime = new Date(Date.now() - config.scheduler.lookbackHours * 3600 * 1000);
  let totalProcessed = 0;
  let requeued = 0;

  try {
    const wooOrders = await getRecentWooOrders('starseguro', 1, 100, startTime.toISOString());
    totalProcessed = wooOrders.length;

    for (const wooOrder of wooOrders) {
      const shopifyId = wooOrder.meta_data.find(m => m.key === '_shopify_order_id')?.value;
      if (!shopifyId) continue;

      // Se houver status_mismatch ou se o pedido estiver faltando (o que o handleOrderAudit poderia checar se comparasse com Shopify), re-enfileira
      // Mas para ser 100% async, vamos fazer o scanner básico aqui e deixar o job tratar a comparação detalhada se necessário, 
      // ou apenas re-enfileirar todos os recentes para garantir (como o original fazia em parte).
      
      requeued++;
      await ordersQueue.add('shop-order-update', {
        id: shopifyId,
        contact_email: wooOrder.billing.email,
        updated_at: new Date().toISOString(),
        source: 'scheduler-audit'
      }, {
        jobId: `audit-order-${shopifyId}-${Date.now()}`,
        removeOnComplete: true,
      });
    }

    console.log(`[Audit] ✓ Auditoria de pedidos concluída: ${totalProcessed} pedidos verificados, ${requeued} re-enfileirados.`);
  } catch (err) {
    console.error('[Audit] Erro na auditoria de pedidos:', err);
    throw err;
  }
}

// ─── Auditoria de Produtos Recentes ─────────────────────────────────────────

export async function handleProductRecentAudit(): Promise<void> {
  console.log(`[Audit] ▶ Iniciando auditoria de produtos recentes`);
  
  let totalProcessed = 0;
  let requeued = 0;

  try {
    const shopifyPage = await getRecentShopifyProducts(50);
    
    if (!shopifyPage?.data?.productVariants) {
      console.error('[Audit] Falha ao buscar produtos do Shopify: Payload inválido ou erro na API', JSON.stringify(shopifyPage));
      return;
    }

    const variants = shopifyPage.data.productVariants.edges.map(e => e.node);
    totalProcessed = variants.length;

    for (const variant of variants) {
      if (!variant.sku) continue;

      requeued++;
      await productsQueue.add('woo-product', {
        sku: variant.sku,
        action: 'update',
        source: 'scheduler-recent'
      }, {
        jobId: `audit-recent-${variant.sku}-${Date.now()}`,
        removeOnComplete: true,
      });
    }

    console.log(`[Audit] ✓ Auditoria de produtos recentes concluída: ${totalProcessed} produtos re-enfileirados.`);
  } catch (err) {
    console.error('[Audit] Erro na auditoria de produtos recentes:', err);
    throw err;
  }
}

// ─── Auditoria Completa Diária ──────────────────────────────────────────────

export async function handleProductFullAudit(): Promise<void> {
  console.log(`[Audit] ▶ Iniciando auditoria COMPLETA diária de produtos`);
  
  let page = 1;
  const perPage = 100;
  let totalProcessed = 0;
  let requeued = 0;
  let errors = 0;

  while (true) {
    try {
      const wooProducts = await getRecentWooProducts('starseguro', page, perPage);
      if (wooProducts.length === 0) break;

      for (const wooProd of wooProducts) {
        if (!wooProd.sku) continue;
        totalProcessed++;

        try {
          const skuResult = await getProductBySku(wooProd.sku);
          const shopifyVariant = skuResult?.data?.productVariants?.edges?.[0]?.node;

          if (!shopifyVariant) continue;

          const shopifyTitle = shopifyVariant.product.title;
          const shopifyPrice = shopifyVariant.price;
          const shopifyQty = shopifyVariant.inventoryQuantity ?? 0;

          const wooTitle = s(wooProd.name);
          const wooPrice = money(wooProd.sale_price || wooProd.regular_price);
          const wooQty = Number(wooProd.stock_quantity ?? 0);

          const hasDivergence = 
            shopifyTitle !== wooTitle || 
            shopifyPrice !== wooPrice || 
            shopifyQty !== wooQty;

          if (hasDivergence) {
            requeued++;
            await productsQueue.add('woo-product', {
              sku: wooProd.sku,
              stock_quantity: wooQty,
              name: wooTitle,
              regular_price: wooProd.regular_price,
              sale_price: wooProd.sale_price,
              source: 'scheduler-daily'
            }, {
              jobId: `audit-full-${wooProd.sku}-${Date.now()}`,
              removeOnComplete: true,
            });
          }
        } catch (err) {
          errors++;
          console.error(`[Audit] Erro ao verificar SKU=${wooProd.sku}:`, (err as Error).message);
        }
      }

      if (wooProducts.length < perPage) break;
      page++;
    } catch (err) {
      console.error(`[Audit] Erro ao buscar página ${page}:`, err);
      break;
    }
  }

  console.log(`[Audit] ✓ Auditoria completa concluída: ${totalProcessed} processados, ${requeued} divergentes, ${errors} erros.`);
}

/**
 * Retorna true se o status do Shopify e do Woo são claramente incompatíveis.
 * Evita falsos positivos: ignora estados que são equivalentes (ex: paid = processing).
 */
export function checkStatusMismatch(shopifyFinancial: string, wooStatus: string): boolean {
  shopifyFinancial = shopifyFinancial?.toLowerCase() ?? '';
  wooStatus = wooStatus?.toLowerCase() ?? '';
  // Shopify PAID → Woo deveria ser processing, completed, on-hold ou similar
  if (shopifyFinancial === 'paid' && wooStatus === 'pending') return true;
  // Shopify REFUNDED → Woo deveria ser refunded ou cancelled
  if (shopifyFinancial === 'refunded' && !['refunded', 'cancelled'].includes(wooStatus)) return true;
  // Shopify VOIDED → Woo deveria ser cancelled
  if (shopifyFinancial === 'voided' && wooStatus !== 'cancelled') return true;
  return false;
}
