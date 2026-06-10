import { OrderModel, type OrderDocument } from '@/models/Order';
import { ProductModel } from '@/models/Product';
import { connectWooMongo } from '@/lib/woo/mongodb';
import { nextWooId } from '@/lib/woo/id-generator';
import { createOrFindCustomerForOrder, extractOrderShopifyCustomerId } from './order-link-service';
import { normalizeEmail, type WooRaw } from './customer-service';

const WOO_STATUSES = new Set(['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed', 'trash']);

function nowIso() {
  return new Date().toISOString().replace(/\.\d+Z$/, '');
}

function str(value: unknown) {
  if (value == null) return undefined;
  const clean = String(value).trim();
  return clean || undefined;
}

function obj(value: unknown): WooRaw {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as WooRaw) : {};
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function metaValue(raw: WooRaw, key: string) {
  const metaData = raw.meta_data;
  if (!Array.isArray(metaData)) return undefined;
  const found = metaData.find((item) => item && typeof item === 'object' && (item as WooRaw).key === key);
  return found && typeof found === 'object' ? (found as WooRaw).value : undefined;
}

export function extractOrderShopifyId(raw: WooRaw) {
  return str(raw.shopify_id) || str(metaValue(raw, 'shopify_id')) || str(metaValue(raw, 'shopify_order_id'));
}

async function linkLineItems(rawItems: unknown[]) {
  const linked = [];
  for (const item of rawItems) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      linked.push(item);
      continue;
    }
    const line = { ...(item as WooRaw) };
    const productId = Number(line.product_id);
    const sku = str(line.sku);
    const shopifyProductId = str(metaValue(line, 'shopify_product_id'));
    const conditions = [];
    if (Number.isFinite(productId) && productId > 0) conditions.push({ woo_id: productId });
    if (sku) conditions.push({ sku });
    if (shopifyProductId) conditions.push({ shopify_id: shopifyProductId });
    const product = conditions.length ? await ProductModel.findOne({ $or: conditions }).lean() : null;
    if (product) line.product_id = product.woo_id;
    linked.push(line);
  }
  return linked;
}

function normalizeOrderRaw(input: WooRaw, wooId: number, existing?: OrderDocument | null): WooRaw {
  const created = str(input.date_created) || str(existing?.raw?.date_created) || nowIso();
  const modified = nowIso();
  const status = str(input.status) || str(existing?.status) || 'processing';
  const number = str(input.number) || str(input.order_number) || str(existing?.order_number) || String(wooId);

  return {
    ...existing?.raw,
    ...input,
    id: wooId,
    parent_id: input.parent_id ?? 0,
    number,
    order_key: input.order_key || `wc_order_${wooId}`,
    created_via: input.created_via || 'rest-api',
    version: input.version || '9.0.0',
    status: WOO_STATUSES.has(status) ? status : 'processing',
    currency: input.currency || 'BRL',
    date_created: created,
    date_created_gmt: input.date_created_gmt || created,
    date_modified: modified,
    date_modified_gmt: modified,
    discount_total: input.discount_total ?? '0.00',
    discount_tax: input.discount_tax ?? '0.00',
    shipping_total: input.shipping_total ?? '0.00',
    shipping_tax: input.shipping_tax ?? '0.00',
    cart_tax: input.cart_tax ?? '0.00',
    total: String(input.total ?? existing?.total ?? '0.00'),
    total_tax: input.total_tax ?? '0.00',
    prices_include_tax: input.prices_include_tax ?? false,
    customer_id: input.customer_id ?? 0,
    customer_ip_address: input.customer_ip_address || '',
    customer_user_agent: input.customer_user_agent || '',
    customer_note: input.customer_note || '',
    billing: input.billing ?? {},
    shipping: input.shipping ?? {},
    payment_method: input.payment_method || '',
    payment_method_title: input.payment_method_title || '',
    transaction_id: input.transaction_id || '',
    date_paid: input.date_paid ?? null,
    date_paid_gmt: input.date_paid_gmt ?? null,
    date_completed: input.date_completed ?? null,
    date_completed_gmt: input.date_completed_gmt ?? null,
    cart_hash: input.cart_hash || '',
    meta_data: input.meta_data ?? [],
    line_items: input.line_items ?? [],
    tax_lines: input.tax_lines ?? [],
    shipping_lines: input.shipping_lines ?? [],
    fee_lines: input.fee_lines ?? [],
    coupon_lines: input.coupon_lines ?? [],
    refunds: input.refunds ?? [],
    set_paid: input.set_paid ?? false,
  };
}

export function normalizeOrderResponse(order: OrderDocument | (WooRaw & { raw?: WooRaw; woo_id?: number; customer_woo_id?: number; billing?: WooRaw; shipping?: WooRaw; line_items?: unknown[]; total?: string }) | null) {
  if (!order) return null;
  const { customer_ref, raw_shopify, ...raw } = order.raw || {};
  return {
    ...raw,
    id: order.woo_id,
    customer_id: order.customer_woo_id || Number(raw.customer_id) || 0,
    billing: { ...(order.billing || {}), ...obj(raw.billing) },
    shipping: { ...(order.shipping || {}), ...obj(raw.shipping) },
    line_items: array(raw.line_items).length ? raw.line_items : order.line_items || [],
    status: raw.status || 'processing',
    total: String(raw.total ?? order.total ?? '0.00'),
  };
}

async function findExistingOrder(input: WooRaw) {
  const wooId = Number(input.id);
  const shopifyId = extractOrderShopifyId(input);
  const number = str(input.number) || str(input.order_number);
  const conditions: Record<string, unknown>[] = [];

  if (Number.isFinite(wooId) && wooId > 0) conditions.push({ woo_id: wooId });
  if (shopifyId) conditions.push({ shopify_id: shopifyId });
  if (number) conditions.push({ order_number: number });

  if (!conditions.length) return null;
  return OrderModel.findOne({ $or: conditions });
}

export async function upsertOrder(input: WooRaw) {
  await connectWooMongo();
  const existing = await findExistingOrder(input);
  const inputId = Number(input.id);
  const wooId = existing?.woo_id || (Number.isFinite(inputId) && inputId > 0 ? inputId : await nextWooId('orders'));
  const raw = normalizeOrderRaw(input, wooId, existing);
  const customer = await createOrFindCustomerForOrder(raw);
  raw.customer_id = customer.woo_id;
  raw.line_items = await linkLineItems(array(raw.line_items));
  const billing = obj(raw.billing);
  const shipping = obj(raw.shipping);
  const customerEmail = normalizeEmail(billing.email) || customer.email;
  const rawShopify = obj(input.raw_shopify);

  const doc = await OrderModel.findOneAndUpdate(
    { woo_id: wooId },
    {
      $set: {
        woo_id: wooId,
        shopify_id: extractOrderShopifyId(raw),
        order_number: str(raw.number),
        status: str(raw.status),
        currency: str(raw.currency),
        total: String(raw.total ?? '0.00'),
        customer_woo_id: customer.woo_id,
        customer_email: customerEmail,
        customer_ref: customer._id,
        billing,
        shipping,
        line_items: array(raw.line_items),
        raw,
        ...(Object.keys(rawShopify).length ? { raw_shopify: rawShopify } : {}),
        updated_at: new Date(),
      },
      $setOnInsert: { created_at: new Date() },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return doc;
}
