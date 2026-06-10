import type { NextRequest } from 'next/server';
import { CustomerModel } from '@/models/Customer';
import { connectWooMongo } from './mongodb';
import { getPagination } from './pagination';
import { invalidCustomerId, wooError } from './woo-errors';
import { listHeaders, wooJson } from './woo-response';
import { normalizeCustomerResponse, upsertCustomer, type WooRaw } from '@/services/customer-service';

type MongoFilter = Record<string, unknown> & { $and?: unknown[]; $or?: unknown[]; woo_id?: unknown };

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

function buildFilter(req: NextRequest): MongoFilter {
  const params = req.nextUrl.searchParams;
  const filter: MongoFilter = {};
  const include = csvNumbers(params.get('include'));
  const exclude = csvNumbers(params.get('exclude'));
  const email = params.get('email');
  const role = params.get('role');
  const search = params.get('search');

  if (include.length) filter.woo_id = { $in: include };
  if (exclude.length) filter.woo_id = { ...(typeof filter.woo_id === 'object' ? filter.woo_id : {}), $nin: exclude };
  if (email) filter.email = email.toLowerCase();
  if (role) filter['raw.role'] = { $in: csvStrings(role) };
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ email: regex }, { first_name: regex }, { last_name: regex }, { username: regex }, { phone: regex }];
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
    email: 'email',
    name: 'first_name',
  };
  return { [fields[orderby] || 'created_at']: order } as Record<string, 1 | -1>;
}

export async function listCustomers(req: NextRequest) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'read'));
  if (auth) return auth;

  await connectWooMongo();
  const { perPage, offset } = getPagination(req);
  const filter = buildFilter(req);
  const [total, docs] = await Promise.all([
    CustomerModel.countDocuments(filter as never),
    CustomerModel.find(filter as never).sort(getSort(req)).skip(offset).limit(perPage).lean(),
  ]);
  return wooJson(docs.map(normalizeCustomerResponse), { headers: listHeaders(total, perPage) });
}

export async function createCustomer(req: NextRequest) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'write'));
  if (auth) return auth;

  const body = await readJson(req);
  if (!body) return wooError('woocommerce_rest_invalid_json', 'Invalid JSON body.', 400);
  const doc = await upsertCustomer(body);
  return wooJson(normalizeCustomerResponse(doc), { status: 201 });
}

export async function getCustomer(req: NextRequest, id: string) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'read'));
  if (auth) return auth;

  await connectWooMongo();
  const doc = await CustomerModel.findOne({ woo_id: Number(id) }).lean();
  if (!doc) return invalidCustomerId();
  return wooJson(normalizeCustomerResponse(doc));
}

export async function updateCustomer(req: NextRequest, id: string) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'write'));
  if (auth) return auth;

  await connectWooMongo();
  const existing = await CustomerModel.findOne({ woo_id: Number(id) });
  if (!existing) return invalidCustomerId();
  const body = await readJson(req);
  if (!body) return wooError('woocommerce_rest_invalid_json', 'Invalid JSON body.', 400);
  const doc = await upsertCustomer({ ...body, id: existing.woo_id });
  return wooJson(normalizeCustomerResponse(doc));
}

export async function deleteCustomer(req: NextRequest, id: string) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'write'));
  if (auth) return auth;

  await connectWooMongo();
  const doc = await CustomerModel.findOne({ woo_id: Number(id) });
  if (!doc) return invalidCustomerId();
  const raw = normalizeCustomerResponse(doc) || {};
  const force = req.nextUrl.searchParams.get('force') === 'true';
  if (force) {
    await CustomerModel.deleteOne({ woo_id: Number(id) });
    return wooJson({ ...raw, deleted: true, previous: raw });
  }
  const updated = await upsertCustomer({ ...raw, id: Number(id), role: 'customer', deleted: true });
  return wooJson(normalizeCustomerResponse(updated));
}

export async function batchCustomers(req: NextRequest) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'write'));
  if (auth) return auth;

  const body = await readJson(req);
  if (!body) return wooError('woocommerce_rest_invalid_json', 'Invalid JSON body.', 400);
  const created = [];
  const updated = [];
  const deleted = [];
  const force = req.nextUrl.searchParams.get('force') === 'true' || body.force === true;

  for (const item of Array.isArray(body.create) ? body.create : []) {
    created.push(normalizeCustomerResponse(await upsertCustomer(item as WooRaw)));
  }
  for (const item of Array.isArray(body.update) ? body.update : []) {
    updated.push(normalizeCustomerResponse(await upsertCustomer(item as WooRaw)));
  }
  for (const item of Array.isArray(body.delete) ? body.delete : []) {
    const id = typeof item === 'object' && item ? (item as WooRaw).id : item;
    const doc = await CustomerModel.findOne({ woo_id: Number(id) });
    if (!doc) continue;
    const raw = normalizeCustomerResponse(doc) || {};
    if (force) {
      await CustomerModel.deleteOne({ woo_id: Number(id) });
      deleted.push({ ...raw, deleted: true, previous: raw });
    } else {
      deleted.push(normalizeCustomerResponse(await upsertCustomer({ ...raw, id: Number(id), deleted: true })));
    }
  }
  return wooJson({ create: created, update: updated, delete: deleted });
}
