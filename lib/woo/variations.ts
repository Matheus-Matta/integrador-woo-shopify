import type { NextRequest } from 'next/server';
import { ProductModel } from '@/models/Product';
import { connectWooMongo } from './mongodb';
import { nextWooId } from './id-generator';
import { invalidId, wooError } from './woo-errors';
import { wooJson } from './woo-response';

type WooRaw = Record<string, unknown>;

async function readJson(req: NextRequest) {
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? (body as WooRaw) : {};
  } catch {
    return null;
  }
}

function asVariationObjects(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is WooRaw => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
}

function getVariationStore(raw: WooRaw) {
  return asVariationObjects(raw._variation_data).length ? asVariationObjects(raw._variation_data) : asVariationObjects(raw.variations);
}

async function getProduct(productId: string) {
  await connectWooMongo();
  return ProductModel.findOne({ woo_id: Number(productId) });
}

async function saveVariations(productId: number, variations: WooRaw[]) {
  const doc = await ProductModel.findOneAndUpdate(
    { woo_id: productId },
    {
      $set: {
        'raw.variations': variations.map((variation) => Number(variation.id)).filter(Number.isFinite),
        'raw._variation_data': variations,
        updated_at: new Date(),
      },
    },
    { new: true }
  );
  return getVariationStore(doc?.raw || {});
}

export async function listVariations(req: NextRequest, productId: string) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'read'));
  if (auth) return auth;

  const product = await getProduct(productId);
  if (!product) return invalidId();
  return wooJson(getVariationStore(product.raw));
}

export async function createVariation(req: NextRequest, productId: string) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'write'));
  if (auth) return auth;

  const product = await getProduct(productId);
  if (!product) return invalidId();
  const body = await readJson(req);
  if (!body) return wooError('woocommerce_rest_invalid_json', 'Invalid JSON body.', 400);

  const variations = getVariationStore(product.raw);
  const id = Number(body.id) || (await nextWooId('product_variations'));
  const variation = { ...body, id, parent_id: product.woo_id };
  variations.push(variation);
  await saveVariations(product.woo_id, variations);

  return wooJson(variation, { status: 201 });
}

export async function getVariation(req: NextRequest, productId: string, variationId: string) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'read'));
  if (auth) return auth;

  const product = await getProduct(productId);
  if (!product) return invalidId();
  const variation = getVariationStore(product.raw).find((item) => Number(item.id) === Number(variationId));
  if (!variation) return invalidId();

  return wooJson(variation);
}

export async function updateVariation(req: NextRequest, productId: string, variationId: string) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'write'));
  if (auth) return auth;

  const product = await getProduct(productId);
  if (!product) return invalidId();
  const body = await readJson(req);
  if (!body) return wooError('woocommerce_rest_invalid_json', 'Invalid JSON body.', 400);

  const variations = getVariationStore(product.raw);
  const index = variations.findIndex((item) => Number(item.id) === Number(variationId));
  if (index < 0) return invalidId();

  variations[index] = { ...variations[index], ...body, id: Number(variationId), parent_id: product.woo_id };
  await saveVariations(product.woo_id, variations);
  return wooJson(variations[index]);
}

export async function deleteVariation(req: NextRequest, productId: string, variationId: string) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'write'));
  if (auth) return auth;

  const product = await getProduct(productId);
  if (!product) return invalidId();
  const variations = getVariationStore(product.raw);
  const index = variations.findIndex((item) => Number(item.id) === Number(variationId));
  if (index < 0) return invalidId();

  const [removed] = variations.splice(index, 1);
  const force = req.nextUrl.searchParams.get('force') === 'true';
  if (force) {
    await saveVariations(product.woo_id, variations);
    return wooJson({ ...removed, deleted: true, previous: removed });
  }

  const trashed = { ...removed, status: 'trash' };
  variations.splice(index, 0, trashed);
  await saveVariations(product.woo_id, variations);
  return wooJson(trashed);
}
