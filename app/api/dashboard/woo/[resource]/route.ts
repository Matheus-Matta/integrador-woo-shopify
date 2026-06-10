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
type Context = { params: Promise<{ resource: string }> };
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

function buildFilter(req: NextRequest, resource: Resource) {
  const params = req.nextUrl.searchParams;
  const search = params.get('search')?.trim();
  const status = params.get('status')?.trim();
  const filter: Record<string, unknown> = {};

  if (status && resource !== 'customers') filter.status = status;
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (resource === 'products') filter.$or = [{ name: regex }, { sku: regex }, { slug: regex }];
    if (resource === 'customers') filter.$or = [{ email: regex }, { first_name: regex }, { last_name: regex }, { phone: regex }];
    if (resource === 'orders') filter.$or = [{ order_number: regex }, { customer_email: regex }, { status: regex }];
  }
  return filter;
}

export async function GET(req: NextRequest, context: Context) {
  const auth = await requireDashboardAuth(req);
  if (auth) return auth;

  const { resource } = await context.params;
  if (!isResource(resource)) {
    return NextResponse.json({ error: 'Recurso invalido' }, { status: 404 });
  }

  await connectWooMongo();
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') || 1));
  const perPage = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('per_page') || 20)));
  const filter = buildFilter(req, resource);
  const model = modelFor(resource) as any;
  const [total, docs] = await Promise.all([
    model.countDocuments(filter as never),
    model.find(filter as never).sort({ updated_at: -1 }).skip((page - 1) * perPage).limit(perPage).lean(),
  ]);

  return NextResponse.json({
    data: docs.map((doc: any) => normalize(resource, doc)),
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    },
  });
}

export async function POST(req: NextRequest, context: Context) {
  const auth = await requireDashboardAuth(req);
  if (auth) return auth;

  const { resource } = await context.params;
  if (!isResource(resource)) {
    return NextResponse.json({ error: 'Recurso invalido' }, { status: 404 });
  }

  const body = await req.json();
  const saved = await upsert(resource, body);
  return NextResponse.json(saved, { status: 201 });
}
