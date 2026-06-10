import type { NextRequest } from 'next/server';
import type { Document, Model } from 'mongoose';
import { OrderModel } from '@/models/Order';
import { OrderNoteModel } from '@/models/OrderNote';
import { OrderRefundModel } from '@/models/OrderRefund';
import { connectWooMongo } from './mongodb';
import { nextWooId } from './id-generator';
import { invalidOrderId, wooError } from './woo-errors';
import { wooJson } from './woo-response';

type Raw = Record<string, unknown>;
type Kind = 'notes' | 'refunds';
type SubDoc = Document & { woo_id: number; order_woo_id: number; raw: Raw };

const map: Record<Kind, { model: Model<SubDoc>; counter: string }> = {
  notes: { model: OrderNoteModel as unknown as Model<SubDoc>, counter: 'order_notes' },
  refunds: { model: OrderRefundModel as unknown as Model<SubDoc>, counter: 'order_refunds' },
};

async function readJson(req: NextRequest) {
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? (body as Raw) : {};
  } catch {
    return null;
  }
}

async function ensureOrder(orderId: string) {
  await connectWooMongo();
  return OrderModel.findOne({ woo_id: Number(orderId) }).lean();
}

function raw(doc: SubDoc | null) {
  if (!doc) return null;
  return { ...(doc.raw || {}), id: doc.woo_id };
}

export async function listOrderSubresources(req: NextRequest, kind: Kind, orderId: string) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'read'));
  if (auth) return auth;
  if (!(await ensureOrder(orderId))) return invalidOrderId();

  const { model } = map[kind];
  const docs = await model.find({ order_woo_id: Number(orderId) }).sort({ woo_id: 1 }).lean();
  return wooJson(docs.map(raw));
}

export async function createOrderSubresource(req: NextRequest, kind: Kind, orderId: string) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'write'));
  if (auth) return auth;
  if (!(await ensureOrder(orderId))) return invalidOrderId();

  const body = await readJson(req);
  if (!body) return wooError('woocommerce_rest_invalid_json', 'Invalid JSON body.', 400);

  const { model, counter } = map[kind];
  const inputId = Number(body.id);
  const wooId = Number.isFinite(inputId) && inputId > 0 ? inputId : await nextWooId(counter);
  const rawBody = {
    ...body,
    id: wooId,
    order_id: Number(orderId),
    date_created: body.date_created || new Date().toISOString().replace(/\.\d+Z$/, ''),
  };
  const doc = await model.findOneAndUpdate(
    { woo_id: wooId },
    {
      $set: { woo_id: wooId, order_woo_id: Number(orderId), raw: rawBody, updated_at: new Date() },
      $setOnInsert: { created_at: new Date() },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return wooJson(raw(doc), { status: 201 });
}

export async function getOrderSubresource(req: NextRequest, kind: Kind, orderId: string, id: string) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'read'));
  if (auth) return auth;
  if (!(await ensureOrder(orderId))) return invalidOrderId();

  const { model } = map[kind];
  const doc = await model.findOne({ woo_id: Number(id), order_woo_id: Number(orderId) }).lean();
  if (!doc) return invalidOrderId();
  return wooJson(raw(doc));
}

export async function deleteOrderSubresource(req: NextRequest, kind: Kind, orderId: string, id: string) {
  const auth = await import('./auth').then(({ requireWooAuth }) => requireWooAuth(req, 'write'));
  if (auth) return auth;
  if (!(await ensureOrder(orderId))) return invalidOrderId();

  const { model } = map[kind];
  const doc = await model.findOne({ woo_id: Number(id), order_woo_id: Number(orderId) });
  if (!doc) return invalidOrderId();
  const previous = raw(doc) || {};
  await model.deleteOne({ woo_id: Number(id), order_woo_id: Number(orderId) });
  return wooJson({ ...previous, deleted: true, previous });
}
