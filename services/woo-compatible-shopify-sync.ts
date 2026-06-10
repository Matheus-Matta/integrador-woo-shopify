import { config } from '@/lib/config';
import { normalizeShopifyCustomerToWooCustomer } from '@/lib/woo/normalizers/shopify-to-woo-customer';
import { normalizeShopifyOrderToWooOrder } from '@/lib/woo/normalizers/shopify-to-woo-order';
import { normalizeShopifyProductToWooProduct } from '@/lib/woo/normalizers/shopify-to-woo-product';
import { upsertProduct } from '@/lib/woo/products';
import { logError } from '@/lib/services/logger';
import { normalizeCustomerResponse, upsertCustomer, type WooRaw } from './customer-service';
import { normalizeOrderResponse, upsertOrder } from './order-service';

export type ShopifyWebhookEntity = 'product' | 'customer' | 'order';

export async function syncShopifyWebhookToWooCompat(entity: ShopifyWebhookEntity, payload: WooRaw) {
  if (!config.wooCompatibleApi.shopifySyncActive) {
    return { active: false, skipped: true as const, reason: 'woo-compatible-shopify-sync-disabled' };
  }

  try {
    if (entity === 'product') {
      const wooProduct = normalizeShopifyProductToWooProduct(payload);
      const saved = await upsertProduct(wooProduct);
      return { active: true, synced: true as const, entity, id: saved?.id };
    }

    if (entity === 'customer') {
      const wooCustomer = normalizeShopifyCustomerToWooCustomer(payload);
      const saved = await upsertCustomer(wooCustomer);
      return { active: true, synced: true as const, entity, id: normalizeCustomerResponse(saved)?.id };
    }

    const wooOrder = normalizeShopifyOrderToWooOrder(payload);
    const saved = await upsertOrder(wooOrder);
    return { active: true, synced: true as const, entity, id: normalizeOrderResponse(saved)?.id };
  } catch (error) {
    await logError({
      flow: `woo-compatible-shopify-sync-${entity}`,
      error_message: (error as Error).message,
      stack: (error as Error).stack,
      payload,
      entity_type: entity === 'customer' ? 'customer' : entity,
      entity_id: String(payload?.id || ''),
    });
    throw error;
  }
}
