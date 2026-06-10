import type { Document, Model } from 'mongoose';
import type { NextRequest } from 'next/server';
import { AttributeModel, type AttributeDocument } from '@/models/Attribute';
import { AttributeTermModel, type AttributeTermDocument } from '@/models/AttributeTerm';
import { CategoryModel, type CategoryDocument } from '@/models/Category';
import { TagModel, type TagDocument } from '@/models/Tag';
import { connectWooMongo } from './mongodb';
import { nextWooId } from './id-generator';
import { getPagination } from './pagination';
import { invalidId, wooError } from './woo-errors';
import { listHeaders, rawFromDocument, wooJson } from './woo-response';

type Raw = Record<string, unknown>;

type ResourceDocument = Document & {
  woo_id: number;
  attribute_id?: number;
  slug?: string;
  name?: string;
  raw: Raw;
  created_at: Date;
  updated_at: Date;
};

export type ResourceKind = 'categories' | 'tags' | 'attributes' | 'attribute_terms';

const resourceMap: Record<ResourceKind, { model: Model<ResourceDocument>; counter: string }> = {
  categories: { model: CategoryModel as unknown as Model<ResourceDocument>, counter: 'categories' },
  tags: { model: TagModel as unknown as Model<ResourceDocument>, counter: 'tags' },
  attributes: { model: AttributeModel as unknown as Model<ResourceDocument>, counter: 'attributes' },
  attribute_terms: { model: AttributeTermModel as unknown as Model<ResourceDocument>, counter: 'attribute_terms' },
};

function stringValue(value: unknown) {
  if (value == null) return undefined;
  const clean = String(value).trim();
  return clean || undefined;
}

async function readJson(req: NextRequest) {
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? (body as Raw) : {};
  } catch {
    return null;
  }
}

function buildResourceRaw(input: Raw, wooId: number, existing?: ResourceDocument | null, attributeId?: number): Raw {
  return {
    ...existing?.raw,
    ...input,
    id: wooId,
    ...(attributeId ? { attribute_id: attributeId } : {}),
  };
}

export async function upsertResource(kind: ResourceKind, input: Raw, attributeId?: number) {
  await connectWooMongo();
  const { model, counter } = resourceMap[kind];
  const wooIdFromPayload = Number(input.id);
  const existing = wooIdFromPayload
    ? await model.findOne({ woo_id: wooIdFromPayload, ...(attributeId ? { attribute_id: attributeId } : {}) })
    : null;
  const wooId = existing?.woo_id || (Number.isFinite(wooIdFromPayload) && wooIdFromPayload > 0 ? wooIdFromPayload : await nextWooId(counter));
  const raw = buildResourceRaw(input, wooId, existing, attributeId);
  const doc = await model.findOneAndUpdate(
    { woo_id: wooId },
    {
      $set: {
        woo_id: wooId,
        ...(attributeId ? { attribute_id: attributeId } : {}),
        slug: stringValue(raw.slug),
        name: stringValue(raw.name),
        raw,
        updated_at: new Date(),
      },
      $setOnInsert: { created_at: new Date() },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return rawFromDocument(doc);
}

export async function listResources(req: NextRequest, kind: ResourceKind, attributeId?: number) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'read'));
  if (auth) return auth;

  await connectWooMongo();
  const { model } = resourceMap[kind];
  const { perPage, offset } = getPagination(req);
  const search = req.nextUrl.searchParams.get('search');
  const slug = req.nextUrl.searchParams.get('slug');
  const filter: Raw = attributeId ? { attribute_id: attributeId } : {};

  if (slug) filter.slug = { $in: slug.split(',').map((item) => item.trim()).filter(Boolean) };
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: regex }, { slug: regex }, { 'raw.description': regex }];
  }

  const [total, docs] = await Promise.all([
    model.countDocuments(filter),
    model.find(filter).sort({ woo_id: 1 }).skip(offset).limit(perPage).lean(),
  ]);

  return wooJson(docs.map(rawFromDocument), { headers: listHeaders(total, perPage) });
}

export async function createResource(req: NextRequest, kind: ResourceKind, attributeId?: number) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'write'));
  if (auth) return auth;

  const body = await readJson(req);
  if (!body) return wooError('woocommerce_rest_invalid_json', 'Invalid JSON body.', 400);

  return wooJson(await upsertResource(kind, body, attributeId), { status: 201 });
}

export async function getResource(req: NextRequest, kind: ResourceKind, id: string, attributeId?: number) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'read'));
  if (auth) return auth;

  await connectWooMongo();
  const { model } = resourceMap[kind];
  const doc = await model.findOne({ woo_id: Number(id), ...(attributeId ? { attribute_id: attributeId } : {}) }).lean();
  if (!doc) return invalidId('term');

  return wooJson(rawFromDocument(doc));
}

export async function updateResource(req: NextRequest, kind: ResourceKind, id: string, attributeId?: number) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'write'));
  if (auth) return auth;

  await connectWooMongo();
  const { model } = resourceMap[kind];
  const existing = await model.findOne({ woo_id: Number(id), ...(attributeId ? { attribute_id: attributeId } : {}) });
  if (!existing) return invalidId('term');

  const body = await readJson(req);
  if (!body) return wooError('woocommerce_rest_invalid_json', 'Invalid JSON body.', 400);

  return wooJson(await upsertResource(kind, { ...body, id: existing.woo_id }, attributeId));
}

export async function deleteResource(req: NextRequest, kind: ResourceKind, id: string, attributeId?: number) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'write'));
  if (auth) return auth;

  await connectWooMongo();
  const { model } = resourceMap[kind];
  const query = { woo_id: Number(id), ...(attributeId ? { attribute_id: attributeId } : {}) };
  const doc = await model.findOne(query);
  if (!doc) return invalidId('term');

  const raw = rawFromDocument(doc) || {};
  await model.deleteOne(query);
  return wooJson({ ...raw, deleted: true, previous: raw });
}

export type { AttributeDocument, AttributeTermDocument, CategoryDocument, TagDocument };
