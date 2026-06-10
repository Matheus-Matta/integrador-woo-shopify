import { CustomerModel, type CustomerDocument } from '@/models/Customer';
import { connectWooMongo } from '@/lib/woo/mongodb';
import { nextWooId } from '@/lib/woo/id-generator';

export type WooRaw = Record<string, unknown>;

function nowIso() {
  return new Date().toISOString().replace(/\.\d+Z$/, '');
}

function str(value: unknown) {
  if (value == null) return undefined;
  const clean = String(value).trim();
  return clean || undefined;
}

export function normalizeEmail(value: unknown) {
  return str(value)?.toLowerCase();
}

function obj(value: unknown): WooRaw {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as WooRaw) : {};
}

function metaValue(raw: WooRaw, key: string) {
  const metaData = raw.meta_data;
  if (!Array.isArray(metaData)) return undefined;
  const found = metaData.find((item) => item && typeof item === 'object' && (item as WooRaw).key === key);
  return found && typeof found === 'object' ? (found as WooRaw).value : undefined;
}

export function extractCustomerShopifyId(raw: WooRaw) {
  return str(raw.shopify_id) || str(metaValue(raw, 'shopify_id')) || str(metaValue(raw, 'shopify_customer_id'));
}

function normalizeCustomerRaw(input: WooRaw, wooId: number, existing?: CustomerDocument | null): WooRaw {
  const billing = { ...obj(existing?.raw?.billing), ...obj(input.billing) };
  const shipping = { ...obj(existing?.raw?.shipping), ...obj(input.shipping) };
  const email = normalizeEmail(input.email) || normalizeEmail(billing.email) || existing?.email || '';
  const created = str(input.date_created) || str(existing?.raw?.date_created) || nowIso();
  const modified = nowIso();
  const firstName = str(input.first_name) || str(billing.first_name) || str(existing?.first_name) || '';
  const lastName = str(input.last_name) || str(billing.last_name) || str(existing?.last_name) || '';

  return {
    ...existing?.raw,
    ...input,
    id: wooId,
    date_created: created,
    date_created_gmt: input.date_created_gmt || created,
    date_modified: modified,
    date_modified_gmt: modified,
    email,
    first_name: firstName,
    last_name: lastName,
    role: input.role || 'customer',
    username: input.username || email,
    billing: {
      first_name: firstName,
      last_name: lastName,
      company: '',
      address_1: '',
      address_2: '',
      city: '',
      state: '',
      postcode: '',
      country: '',
      email,
      phone: '',
      ...billing,
    },
    shipping: {
      first_name: firstName,
      last_name: lastName,
      company: '',
      address_1: '',
      address_2: '',
      city: '',
      state: '',
      postcode: '',
      country: '',
      ...shipping,
    },
    is_paying_customer: input.is_paying_customer ?? true,
    avatar_url: input.avatar_url || '',
    meta_data: input.meta_data ?? [],
  };
}

export function normalizeCustomerResponse(customer: CustomerDocument | (WooRaw & { raw?: WooRaw; woo_id?: number; email?: string; billing?: WooRaw; shipping?: WooRaw }) | null) {
  if (!customer) return null;
  const raw = { ...(customer.raw || {}) };
  return {
    ...raw,
    id: customer.woo_id,
    email: normalizeEmail(raw.email) || customer.email || '',
    billing: { ...(customer.billing || {}), ...obj(raw.billing) },
    shipping: { ...(customer.shipping || {}), ...obj(raw.shipping) },
  };
}

async function findExistingCustomer(input: WooRaw) {
  const wooId = Number(input.id);
  const email = normalizeEmail(input.email) || normalizeEmail(obj(input.billing).email);
  const shopifyId = extractCustomerShopifyId(input);
  const conditions: Record<string, unknown>[] = [];

  if (Number.isFinite(wooId) && wooId > 0) conditions.push({ woo_id: wooId });
  if (shopifyId) conditions.push({ shopify_id: shopifyId });
  if (email) conditions.push({ email });

  if (!conditions.length) return null;
  return CustomerModel.findOne({ $or: conditions });
}

export async function upsertCustomer(input: WooRaw) {
  await connectWooMongo();
  const existing = await findExistingCustomer(input);
  const inputId = Number(input.id);
  const wooId = existing?.woo_id || (Number.isFinite(inputId) && inputId > 0 ? inputId : await nextWooId('customers'));
  const raw = normalizeCustomerRaw(input, wooId, existing);
  const billing = obj(raw.billing);
  const shipping = obj(raw.shipping);
  const email = normalizeEmail(raw.email);
  const doc = await CustomerModel.findOneAndUpdate(
    { woo_id: wooId },
    {
      $set: {
        woo_id: wooId,
        shopify_id: extractCustomerShopifyId(raw),
        email,
        first_name: str(raw.first_name),
        last_name: str(raw.last_name),
        username: str(raw.username),
        phone: str(billing.phone),
        billing,
        shipping,
        raw,
        updated_at: new Date(),
      },
      $setOnInsert: { created_at: new Date() },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return doc;
}

export async function findCustomerForOrderLookup(lookup: {
  customerId?: number;
  shopifyCustomerId?: string;
  billingEmail?: string;
  shippingEmail?: string;
}) {
  await connectWooMongo();
  if (lookup.customerId) {
    const customer = await CustomerModel.findOne({ woo_id: lookup.customerId });
    if (customer) return customer;
  }
  if (lookup.shopifyCustomerId) {
    const customer = await CustomerModel.findOne({ shopify_id: lookup.shopifyCustomerId });
    if (customer) return customer;
  }
  const billingEmail = normalizeEmail(lookup.billingEmail);
  if (billingEmail) {
    const customer = await CustomerModel.findOne({ email: billingEmail });
    if (customer) return customer;
  }
  const shippingEmail = normalizeEmail(lookup.shippingEmail);
  if (shippingEmail) {
    const customer = await CustomerModel.findOne({ email: shippingEmail });
    if (customer) return customer;
  }
  return null;
}
