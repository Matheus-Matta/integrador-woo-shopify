import type { CustomerDocument } from '@/models/Customer';
import { findCustomerForOrderLookup, normalizeEmail, upsertCustomer, type WooRaw } from './customer-service';

function obj(value: unknown): WooRaw {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as WooRaw) : {};
}

function str(value: unknown) {
  if (value == null) return undefined;
  const clean = String(value).trim();
  return clean || undefined;
}

function metaValue(raw: WooRaw, key: string) {
  const metaData = raw.meta_data;
  if (!Array.isArray(metaData)) return undefined;
  const found = metaData.find((item) => item && typeof item === 'object' && (item as WooRaw).key === key);
  return found && typeof found === 'object' ? (found as WooRaw).value : undefined;
}

export function extractOrderShopifyCustomerId(raw: WooRaw) {
  const customer = obj(raw.customer);
  return (
    str(raw.shopify_customer_id) ||
    str(customer.id) ||
    str(metaValue(raw, 'shopify_customer_id')) ||
    str(metaValue(raw, 'shopify_customer_id_raw')) ||
    str(metaValue(raw, 'customer_shopify_id'))
  );
}

export async function createOrFindCustomerForOrder(order: WooRaw): Promise<CustomerDocument> {
  const billing = obj(order.billing);
  const shipping = obj(order.shipping);
  const customerId = Number(order.customer_id);
  const customer = await findCustomerForOrderLookup({
    customerId: Number.isFinite(customerId) && customerId > 0 ? customerId : undefined,
    shopifyCustomerId: extractOrderShopifyCustomerId(order),
    billingEmail: str(billing.email),
    shippingEmail: str(shipping.email),
  });

  if (customer) {
    order.customer_id = customer.woo_id;
    return customer;
  }

  const email = normalizeEmail(billing.email) || normalizeEmail(shipping.email) || '';
  const created = await upsertCustomer({
    shopify_id: extractOrderShopifyCustomerId(order),
    email,
    first_name: billing.first_name || shipping.first_name || '',
    last_name: billing.last_name || shipping.last_name || '',
    username: email,
    billing: { ...billing, email },
    shipping,
    meta_data: [{ key: 'created_from_order', value: true }],
  });

  order.customer_id = created.woo_id;
  return created;
}
