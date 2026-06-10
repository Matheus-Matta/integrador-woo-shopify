import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAuth } from '@/lib/auth/dashboard';
import { connectWooMongo } from '@/lib/woo/mongodb';
import { rawFromDocument } from '@/lib/woo/woo-response';
import { ProductModel } from '@/models/Product';
import { CustomerModel } from '@/models/Customer';
import { OrderModel } from '@/models/Order';
import { upsertProduct } from '@/lib/woo/products';
import { normalizeCustomerResponse, upsertCustomer } from '@/services/customer-service';
import { normalizeOrderResponse, upsertOrder } from '@/services/order-service';

type Resource = 'products' | 'orders' | 'customers';
type Context = { params: Promise<{ resource: string; id: string }> };
type Raw = Record<string, unknown>;

function isResource(value: string): value is Resource {
  return ['products', 'orders', 'customers'].includes(value);
}

function modelFor(resource: Resource) {
  if (resource === 'products') return ProductModel;
  if (resource === 'customers') return CustomerModel;
  return OrderModel;
}

function normalize(resource: Resource, doc: any) {
  if (resource === 'products') return rawFromDocument(doc);
  if (resource === 'customers') return normalizeCustomerResponse(doc);
  return normalizeOrderResponse(doc);
}

async function upsert(resource: Resource, body: Raw) {
  if (resource === 'products') return upsertProduct(body);
  if (resource === 'customers') return normalizeCustomerResponse(await upsertCustomer(body));
  return normalizeOrderResponse(await upsertOrder(body));
}

export async function GET(req: NextRequest, context: Context) {
  const auth = await requireDashboardAuth(req);
  if (auth) return auth;

  const { resource, id } = await context.params;
  if (!isResource(resource)) {
    return NextResponse.json({ error: 'Recurso invalido' }, { status: 404 });
  }

  await connectWooMongo();
  const doc = await (modelFor(resource) as any).findOne({ woo_id: Number(id) }).lean();
  if (!doc) return NextResponse.json({ error: 'Registro nao encontrado' }, { status: 404 });
  return NextResponse.json(normalize(resource, doc));
}

export async function PUT(req: NextRequest, context: Context) {
  const auth = await requireDashboardAuth(req);
  if (auth) return auth;

  const { resource, id } = await context.params;
  if (!isResource(resource)) {
    return NextResponse.json({ error: 'Recurso invalido' }, { status: 404 });
  }

  const existing = await (modelFor(resource) as any).findOne({ woo_id: Number(id) }).lean();
  if (!existing) return NextResponse.json({ error: 'Registro nao encontrado' }, { status: 404 });
  const body = await req.json();
  return NextResponse.json(await upsert(resource, { ...body, id: Number(id) }));
}

export async function PATCH(req: NextRequest, context: Context) {
  return PUT(req, context);
}

export async function DELETE(req: NextRequest, context: Context) {
  const auth = await requireDashboardAuth(req);
  if (auth) return auth;

  const { resource, id } = await context.params;
  if (!isResource(resource)) {
    return NextResponse.json({ error: 'Recurso invalido' }, { status: 404 });
  }

  await connectWooMongo();
  const model = modelFor(resource) as any;
  const doc = await model.findOne({ woo_id: Number(id) }).lean();
  if (!doc) return NextResponse.json({ error: 'Registro nao encontrado' }, { status: 404 });
  await model.deleteOne({ woo_id: Number(id) });
  return NextResponse.json({ deleted: true, previous: normalize(resource, doc) });
}
