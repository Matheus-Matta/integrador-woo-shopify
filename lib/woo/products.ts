import type { NextRequest } from 'next/server';
import { ProductModel, type ProductDocument } from '@/models/Product';
import { connectWooMongo } from './mongodb';
import { nextWooId } from './id-generator';
import { getPagination } from './pagination';
import { invalidId, wooError } from './woo-errors';
import { listHeaders, rawFromDocument, wooJson } from './woo-response';

type WooRaw = Record<string, unknown>;
type MongoFilter = Record<string, unknown> & {
  $and?: unknown[];
  $or?: unknown[];
  woo_id?: unknown;
  created_at?: Record<string, Date>;
  updated_at?: Record<string, Date>;
};

function nowIso() {
  return new Date().toISOString().replace(/\.\d+Z$/, '');
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function csvNumbers(value: string | null) {
  if (!value) return [];
  return value.split(',').map((item) => Number(item.trim())).filter(Number.isFinite);
}

function csvStrings(value: string | null) {
  if (!value) return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function boolValue(value: string | null) {
  if (value == null) return undefined;
  if (['true', '1', 'yes'].includes(value.toLowerCase())) return true;
  if (['false', '0', 'no'].includes(value.toLowerCase())) return false;
  return undefined;
}

function addAnd(filter: MongoFilter, condition: unknown) {
  filter.$and = [...(filter.$and || []), condition];
}

function stringValue(value: unknown) {
  if (value == null) return undefined;
  const clean = String(value).trim();
  return clean || undefined;
}

function metaValue(raw: WooRaw, key: string) {
  const metaData = raw.meta_data;
  if (!Array.isArray(metaData)) return undefined;
  const found = metaData.find((item) => {
    if (!item || typeof item !== 'object') return false;
    return (item as { key?: unknown }).key === key;
  });
  return found && typeof found === 'object' ? (found as { value?: unknown }).value : undefined;
}

function extractShopifyId(raw: WooRaw) {
  return stringValue(raw.shopify_id) || stringValue(metaValue(raw, 'shopify_id'));
}

function normalizeRawProduct(input: WooRaw, wooId: number, existing?: ProductDocument | null): WooRaw {
  const created = stringValue(input.date_created) || stringValue(existing?.raw?.date_created) || nowIso();
  const modified = nowIso();
  const baseUrl = (process.env.DOMAIN || process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || '').replace(/\/$/, '');
  const slug = stringValue(input.slug) || stringValue(existing?.slug) || stringValue(input.name)?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  return {
    ...existing?.raw,
    ...input,
    id: wooId,
    slug,
    permalink: input.permalink || (baseUrl && slug ? `${baseUrl}/produto/${slug}` : ''),
    date_created: created,
    date_created_gmt: input.date_created_gmt || created,
    date_modified: modified,
    date_modified_gmt: modified,
    type: input.type || existing?.type || 'simple',
    status: input.status || existing?.status || 'publish',
    featured: input.featured ?? false,
    catalog_visibility: input.catalog_visibility || 'visible',
    description: input.description || '',
    short_description: input.short_description || '',
    sku: input.sku ?? existing?.sku ?? '',
    price: input.price ?? '',
    regular_price: input.regular_price ?? input.price ?? '',
    sale_price: input.sale_price ?? '',
    on_sale: input.on_sale ?? Boolean(input.sale_price),
    purchasable: input.purchasable ?? true,
    total_sales: input.total_sales ?? 0,
    virtual: input.virtual ?? false,
    downloadable: input.downloadable ?? false,
    downloads: input.downloads ?? [],
    download_limit: input.download_limit ?? -1,
    download_expiry: input.download_expiry ?? -1,
    tax_status: input.tax_status || 'taxable',
    tax_class: input.tax_class || '',
    manage_stock: input.manage_stock ?? false,
    stock_quantity: input.stock_quantity ?? null,
    stock_status: input.stock_status || 'instock',
    backorders: input.backorders || 'no',
    backorders_allowed: input.backorders_allowed ?? false,
    backordered: input.backordered ?? false,
    sold_individually: input.sold_individually ?? false,
    weight: input.weight || '',
    dimensions: input.dimensions || { length: '', width: '', height: '' },
    shipping_required: input.shipping_required ?? true,
    shipping_taxable: input.shipping_taxable ?? true,
    shipping_class: input.shipping_class || '',
    shipping_class_id: input.shipping_class_id ?? 0,
    reviews_allowed: input.reviews_allowed ?? true,
    average_rating: input.average_rating || '0.00',
    rating_count: input.rating_count ?? 0,
    categories: input.categories ?? [],
    tags: input.tags ?? [],
    images: input.images ?? [],
    attributes: input.attributes ?? [],
    default_attributes: input.default_attributes ?? [],
    variations: input.variations ?? existing?.raw?.variations ?? [],
    grouped_products: input.grouped_products ?? [],
    menu_order: input.menu_order ?? 0,
    price_html: input.price_html || '',
    related_ids: input.related_ids ?? [],
    meta_data: input.meta_data ?? [],
  };
}

async function readJson(req: NextRequest) {
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? (body as WooRaw) : {};
  } catch {
    return null;
  }
}

async function findExistingProduct(input: WooRaw) {
  const wooId = toNumber(input.id);
  const sku = stringValue(input.sku);
  const shopifyId = extractShopifyId(input);
  const conditions: Record<string, unknown>[] = [];

  if (wooId) conditions.push({ woo_id: wooId });
  if (sku) conditions.push({ sku });
  if (shopifyId) conditions.push({ shopify_id: shopifyId });

  if (!conditions.length) return null;
  return ProductModel.findOne({ $or: conditions });
}

export async function upsertProduct(input: WooRaw) {
  await connectWooMongo();
  const existing = await findExistingProduct(input);
  const wooId = existing?.woo_id || toNumber(input.id) || (await nextWooId('products'));
  const raw = normalizeRawProduct(input, wooId, existing);
  const doc = await ProductModel.findOneAndUpdate(
    { woo_id: wooId },
    {
      $set: {
        woo_id: wooId,
        shopify_id: extractShopifyId(raw),
        sku: stringValue(raw.sku),
        slug: stringValue(raw.slug),
        name: stringValue(raw.name),
        status: stringValue(raw.status),
        type: stringValue(raw.type),
        raw,
        updated_at: new Date(),
      },
      $setOnInsert: { created_at: new Date() },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return rawFromDocument(doc);
}

function buildProductFilter(req: NextRequest): MongoFilter {
  const params = req.nextUrl.searchParams;
  const filter: MongoFilter = {};
  const include = csvNumbers(params.get('include'));
  const exclude = csvNumbers(params.get('exclude'));
  const status = params.get('status');
  const type = params.get('type');
  const sku = params.get('sku');
  const slug = params.get('slug');
  const search = params.get('search');
  const featured = boolValue(params.get('featured'));
  const onSale = boolValue(params.get('on_sale'));
  const stockStatus = params.get('stock_status');
  const category = params.get('category');
  const tag = params.get('tag');
  const parent = params.get('parent');
  const parentExclude = csvNumbers(params.get('parent_exclude'));
  const shippingClass = params.get('shipping_class');
  const attribute = params.get('attribute');
  const attributeTerm = params.get('attribute_term');
  const taxClass = params.get('tax_class');
  const minPrice = params.get('min_price');
  const maxPrice = params.get('max_price');

  if (include.length) filter.woo_id = { $in: include };
  if (exclude.length) filter.woo_id = { ...(typeof filter.woo_id === 'object' ? filter.woo_id : {}), $nin: exclude };
  if (status) filter.status = { $in: csvStrings(status) };
  if (type) filter.type = { $in: csvStrings(type) };
  if (sku) filter.sku = { $in: csvStrings(sku) };
  if (slug) filter.slug = { $in: csvStrings(slug) };
  if (featured !== undefined) filter['raw.featured'] = featured;
  if (onSale !== undefined) filter['raw.on_sale'] = onSale;
  if (stockStatus) filter['raw.stock_status'] = { $in: csvStrings(stockStatus) };
  if (parent) filter['raw.parent_id'] = toNumber(parent) || parent;
  if (parentExclude.length) filter['raw.parent_id'] = { $nin: parentExclude };
  if (shippingClass) addAnd(filter, { $or: [{ 'raw.shipping_class': shippingClass }, { 'raw.shipping_class_id': toNumber(shippingClass) }] });
  if (taxClass) filter['raw.tax_class'] = { $in: csvStrings(taxClass) };
  if (category) addAnd(filter, { $or: [{ 'raw.categories.id': toNumber(category) }, { 'raw.categories.slug': category }, { 'raw.categories.name': category }] });
  if (tag) addAnd(filter, { $or: [{ 'raw.tags.id': toNumber(tag) }, { 'raw.tags.slug': tag }, { 'raw.tags.name': tag }] });
  if (attribute) addAnd(filter, { $or: [{ 'raw.attributes.id': toNumber(attribute) }, { 'raw.attributes.name': attribute }, { 'raw.attributes.slug': attribute }] });
  if (attributeTerm) addAnd(filter, { $or: [{ 'raw.attributes.options': attributeTerm }, { 'raw.attributes.option': attributeTerm }] });

  const priceExpr = { $convert: { input: '$raw.price', to: 'double', onError: 0, onNull: 0 } };
  if (minPrice && Number.isFinite(Number(minPrice))) addAnd(filter, { $expr: { $gte: [priceExpr, Number(minPrice)] } });
  if (maxPrice && Number.isFinite(Number(maxPrice))) addAnd(filter, { $expr: { $lte: [priceExpr, Number(maxPrice)] } });

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

  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const searchOr = [{ name: regex }, { sku: regex }, { slug: regex }, { 'raw.description': regex }, { 'raw.short_description': regex }];
    filter.$and = [...(filter.$and || []), { $or: searchOr }];
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
    name: 'name',
    slug: 'slug',
    sku: 'sku',
    price: 'raw.price',
  };

  return { [fields[orderby] || 'created_at']: order } as Record<string, 1 | -1>;
}

export async function listProducts(req: NextRequest) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'read'));
  if (auth) return auth;

  await connectWooMongo();
  const { perPage, offset } = getPagination(req);
  const filter = buildProductFilter(req);
  const [total, docs] = await Promise.all([
    ProductModel.countDocuments(filter as never),
    ProductModel.find(filter as never).sort(getSort(req)).skip(offset).limit(perPage).lean(),
  ]);

  return wooJson(docs.map(rawFromDocument), { headers: listHeaders(total, perPage) });
}

export async function createProduct(req: NextRequest) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'write'));
  if (auth) return auth;

  const body = await readJson(req);
  if (!body) return wooError('woocommerce_rest_invalid_json', 'Invalid JSON body.', 400);

  return wooJson(await upsertProduct(body), { status: 201 });
}

export async function getProduct(req: NextRequest, id: string) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'read'));
  if (auth) return auth;

  await connectWooMongo();
  const wooId = Number(id);
  const doc = await ProductModel.findOne({ woo_id: wooId }).lean();
  if (!doc) return invalidId();

  return wooJson(rawFromDocument(doc));
}

export async function updateProduct(req: NextRequest, id: string) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'write'));
  if (auth) return auth;

  await connectWooMongo();
  const existing = await ProductModel.findOne({ woo_id: Number(id) });
  if (!existing) return invalidId();

  const body = await readJson(req);
  if (!body) return wooError('woocommerce_rest_invalid_json', 'Invalid JSON body.', 400);

  return wooJson(await upsertProduct({ ...body, id: existing.woo_id }));
}

export async function deleteProduct(req: NextRequest, id: string) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'write'));
  if (auth) return auth;

  await connectWooMongo();
  const wooId = Number(id);
  const doc = await ProductModel.findOne({ woo_id: wooId });
  if (!doc) return invalidId();

  const force = req.nextUrl.searchParams.get('force') === 'true';
  const raw = rawFromDocument(doc) || {};
  if (force) {
    await ProductModel.deleteOne({ woo_id: wooId });
    return wooJson({ ...raw, deleted: true, previous: raw });
  }

  return wooJson(await upsertProduct({ ...raw, id: wooId, status: 'trash' }));
}

export async function batchProducts(req: NextRequest) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'write'));
  if (auth) return auth;

  const body = await readJson(req);
  if (!body) return wooError('woocommerce_rest_invalid_json', 'Invalid JSON body.', 400);

  const create = Array.isArray(body.create) ? body.create : [];
  const update = Array.isArray(body.update) ? body.update : [];
  const remove = Array.isArray(body.delete) ? body.delete : [];
  const force = req.nextUrl.searchParams.get('force') === 'true' || body.force === true;

  const created = [];
  for (const item of create) created.push(await upsertProduct(item as WooRaw));

  const updated = [];
  for (const item of update) updated.push(await upsertProduct(item as WooRaw));

  const deleted = [];
  for (const item of remove) {
    const id = typeof item === 'object' && item ? (item as WooRaw).id : item;
    const doc = await ProductModel.findOne({ woo_id: Number(id) });
    if (!doc) continue;
    const raw = rawFromDocument(doc) || {};
    if (force) {
      await ProductModel.deleteOne({ woo_id: Number(id) });
      deleted.push({ ...raw, deleted: true, previous: raw });
    } else {
      deleted.push(await upsertProduct({ ...raw, id: Number(id), status: 'trash' }));
    }
  }

  return wooJson({ create: created, update: updated, delete: deleted });
}
