import type { NextRequest } from 'next/server';
import { OrderModel } from '@/models/Order';
import { connectWooMongo } from './mongodb';
import { getPagination } from './pagination';
import { invalidOrderId, wooError } from './woo-errors';
import { listHeaders, wooJson } from './woo-response';
import { extractOrderShopifyId, normalizeOrderResponse, upsertOrder } from '@/services/order-service';
import type { WooRaw } from '@/services/customer-service';

type MongoFilter = Record<string, unknown> & {
  $and?: unknown[];
  $or?: unknown[];
  woo_id?: unknown;
  created_at?: Record<string, Date>;
  updated_at?: Record<string, Date>;
};

async function readJson(req: NextRequest) {
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? (body as WooRaw) : {};
  } catch {
    return null;
  }
}

function csvNumbers(value: string | null) {
  if (!value) return [];
  return value.split(',').map((item) => Number(item.trim())).filter(Number.isFinite);
}

function csvStrings(value: string | null) {
  if (!value) return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function addAnd(filter: MongoFilter, condition: unknown) {
  filter.$and = [...(filter.$and || []), condition];
}

function buildFilter(req: NextRequest): MongoFilter {
  const params = req.nextUrl.searchParams;
  const filter: MongoFilter = {};
  const include = csvNumbers(params.get('include'));
  const exclude = csvNumbers(params.get('exclude'));
  const parentExclude = csvNumbers(params.get('parent_exclude'));
  const search = params.get('search');
  const status = params.get('status');
  const customer = params.get('customer');
  const product = params.get('product');
  const billingEmail = params.get('billing_email');
  const customerEmail = params.get('customer_email');
  const shopifyId = params.get('shopify_id');
  const number = params.get('number');
  const createdVia = params.get('created_via');
  const parent = params.get('parent');

  if (include.length) filter.woo_id = { $in: include };
  if (exclude.length) filter.woo_id = { ...(typeof filter.woo_id === 'object' ? filter.woo_id : {}), $nin: exclude };
  if (status) filter.status = { $in: csvStrings(status) };
  if (customer) filter.customer_woo_id = Number(customer);
  if (billingEmail) filter['billing.email'] = billingEmail.toLowerCase();
  if (customerEmail) filter.customer_email = customerEmail.toLowerCase();
  if (shopifyId) filter.shopify_id = shopifyId;
  if (number) filter.order_number = number;
  if (createdVia) filter['raw.created_via'] = createdVia;
  if (parent) filter['raw.parent_id'] = Number(parent) || parent;
  if (parentExclude.length) filter['raw.parent_id'] = { $nin: parentExclude };
  if (product) addAnd(filter, { $or: [{ 'line_items.product_id': Number(product) }, { 'raw.line_items.product_id': Number(product) }] });

  const after = params.get('after');
  const before = params.get('before');
  const modifiedAfter = params.get('modified_after');
  const modifiedBefore = params.get('modified_before');
  if (after || before) {
    filter.created_at = {};
    if (after) filter.created_at.$gte = new Date(after);
    if (before) filter.created_at.$lte = new Date(before);
  }
  if (modifiedAfter || modifiedBefore) {
    filter.updated_at = {};
    if (modifiedAfter) filter.updated_at.$gte = new Date(modifiedAfter);
    if (modifiedBefore) filter.updated_at.$lte = new Date(modifiedBefore);
  }

  const totalExpr = { $convert: { input: '$total', to: 'double', onError: 0, onNull: 0 } };
  const minTotal = params.get('min_total');
  const maxTotal = params.get('max_total');
  if (minTotal && Number.isFinite(Number(minTotal))) addAnd(filter, { $expr: { $gte: [totalExpr, Number(minTotal)] } });
  if (maxTotal && Number.isFinite(Number(maxTotal))) addAnd(filter, { $expr: { $lte: [totalExpr, Number(maxTotal)] } });

  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    addAnd(filter, { $or: [{ order_number: regex }, { customer_email: regex }, { 'billing.first_name': regex }, { 'billing.last_name': regex }] });
  }
  return filter;
}

function getSort(req: NextRequest) {
  const order = req.nextUrl.searchParams.get('order') === 'asc' ? 1 : -1;
  const orderby = req.nextUrl.searchParams.get('orderby') || 'date';
  const fields: Record<string, string> = {
    id: 'woo_id',
    date: 'created_at',
    modified: 'updated_at',
    total: 'total',
    number: 'order_number',
  };
  return { [fields[orderby] || 'created_at']: order } as Record<string, 1 | -1>;
}

export async function listOrders(req: NextRequest) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'read'));
  if (auth) return auth;

  await connectWooMongo();
  const { perPage, offset } = getPagination(req);
  const filter = buildFilter(req);
  const [total, docs] = await Promise.all([
    OrderModel.countDocuments(filter as never),
    OrderModel.find(filter as never).sort(getSort(req)).skip(offset).limit(perPage).lean(),
  ]);
  return wooJson(docs.map(normalizeOrderResponse), { headers: listHeaders(total, perPage) });
}

export async function createOrder(req: NextRequest) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'write'));
  if (auth) return auth;

  const body = await readJson(req);
  if (!body) return wooError('woocommerce_rest_invalid_json', 'Invalid JSON body.', 400);
  const doc = await upsertOrder(body);
  return wooJson(normalizeOrderResponse(doc), { status: 201 });
}

export async function getOrder(req: NextRequest, id: string) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'read'));
  if (auth) return auth;

  await connectWooMongo();
  const doc = await OrderModel.findOne({ woo_id: Number(id) }).lean();
  if (!doc) return invalidOrderId();
  return wooJson(normalizeOrderResponse(doc));
}

export async function updateOrder(req: NextRequest, id: string) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'write'));
  if (auth) return auth;

  await connectWooMongo();
  const existing = await OrderModel.findOne({ woo_id: Number(id) });
  if (!existing) return invalidOrderId();
  const body = await readJson(req);
  if (!body) return wooError('woocommerce_rest_invalid_json', 'Invalid JSON body.', 400);
  const doc = await upsertOrder({ ...body, id: existing.woo_id });
  return wooJson(normalizeOrderResponse(doc));
}

export async function deleteOrder(req: NextRequest, id: string) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'write'));
  if (auth) return auth;

  await connectWooMongo();
  const doc = await OrderModel.findOne({ woo_id: Number(id) });
  if (!doc) return invalidOrderId();
  const raw = normalizeOrderResponse(doc) || {};
  const force = req.nextUrl.searchParams.get('force') === 'true';
  if (force) {
    await OrderModel.deleteOne({ woo_id: Number(id) });
    return wooJson({ ...raw, deleted: true, previous: raw });
  }
  const updated = await upsertOrder({ ...raw, id: Number(id), status: 'trash' });
  return wooJson(normalizeOrderResponse(updated));
}

export async function batchOrders(req: NextRequest) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'write'));
  if (auth) return auth;

  const body = await readJson(req);
  if (!body) return wooError('woocommerce_rest_invalid_json', 'Invalid JSON body.', 400);
  const force = req.nextUrl.searchParams.get('force') === 'true' || body.force === true;
  const created = [];
  const updated = [];
  const deleted = [];

  for (const item of Array.isArray(body.create) ? body.create : []) {
    created.push(normalizeOrderResponse(await upsertOrder(item as WooRaw)));
  }
  for (const item of Array.isArray(body.update) ? body.update : []) {
    updated.push(normalizeOrderResponse(await upsertOrder(item as WooRaw)));
  }
  for (const item of Array.isArray(body.delete) ? body.delete : []) {
    const id = typeof item === 'object' && item ? (item as WooRaw).id : item;
    const doc = await OrderModel.findOne({ woo_id: Number(id) });
    if (!doc) continue;
    const raw = normalizeOrderResponse(doc) || {};
    if (force) {
      await OrderModel.deleteOne({ woo_id: Number(id) });
      deleted.push({ ...raw, deleted: true, previous: raw });
    } else {
      deleted.push(normalizeOrderResponse(await upsertOrder({ ...raw, id: Number(id), status: 'trash' })));
    }
  }
  return wooJson({ create: created, update: updated, delete: deleted });
}
