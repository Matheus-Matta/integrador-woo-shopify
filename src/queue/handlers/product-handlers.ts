/**
 * Handler para a fila "products" — lógica de negócio do woo-product webhook
 */
import { getProductBySku, updateProductTitle, updateStock, updatePrice } from '../../services/shopify';
import { cacheDel } from '../../db/redis';
import { logProduct } from '../../services/logger';
import { s, money } from '../../utils/helpers';

export interface WooProductPayload {
  sku?: string;
  stock_quantity?: number;
  name?: string;
  regular_price?: string;
  sale_price?: string;
  body?: {
    sku?: string;
    stock_quantity?: number;
    name?: string;
    regular_price?: string;
    sale_price?: string;
  };
}

export async function handleWooProduct(raw: WooProductPayload): Promise<void> {
  const prod = raw?.body ?? raw;
  const sku = s(prod?.sku);
  const stockQtd = Number(prod?.stock_quantity ?? 0);
  const name = s(prod?.name);
  const regularPrice = s(prod?.regular_price);
  const salePrice = s(prod?.sale_price);

  if (!sku) throw new Error('SKU obrigatório');

  const skuResult = await getProductBySku(sku);
  const edges = skuResult?.data?.productVariants?.edges ?? [];

  if (edges.length === 0) {
    await logProduct({ sku, action: 'sku_not_found', status: 'skipped' });
    return;
  }

  const variant = edges[0].node;
  const productId = variant.product.id;
  const variantId = variant.id;
  const inventoryItemId = variant.inventoryItem.id;
  const locationId = variant.inventoryItem.inventoryLevels.edges[0]?.node?.location?.id;
  const currentQty = variant.inventoryItem.inventoryLevels.edges[0]?.node?.quantities?.[0]?.quantity ?? 0;
  const delta = stockQtd - currentQty;

  await cacheDel(`shopify:sku:${sku}`);

  const freshResult = await getProductBySku(sku);
  const freshVariant = freshResult?.data?.productVariants?.edges?.[0]?.node;
  if (!freshVariant) {
    await logProduct({ sku, action: 'sku_not_found_after_refresh', status: 'error' });
    return;
  }

  if (name) {
    const titleRes = await updateProductTitle(productId, name);
    await logProduct({ sku, action: 'title_update', after: { name }, shopify_response: titleRes });
  }

  const stockRes = await updateStock(inventoryItemId, locationId, delta);
  await logProduct({ sku, action: 'stock_update', before: { quantity: currentQty }, after: { quantity: stockQtd, delta }, shopify_response: stockRes });

  const finalPrice = salePrice && salePrice !== '' ? salePrice : regularPrice;
  const compareAtPrice = salePrice && salePrice !== '' ? regularPrice : null;
  const priceRes = await updatePrice(productId, variantId, money(finalPrice), compareAtPrice ? money(compareAtPrice) : null);
  await logProduct({ sku, action: 'price_update', after: { price: finalPrice, compareAtPrice }, shopify_response: priceRes });
}
