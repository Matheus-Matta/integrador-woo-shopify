import { NextRequest, NextResponse } from 'next/server';
import { Model } from 'mongoose';
import {
  LogProductModel,
  LogCustomerModel,
  LogOrderModel,
  LogErrorModel,
  connectMongo,
} from '@/lib/db/mongo';

const MODEL_MAP: Record<string, Model<any>> = {
  product: LogProductModel,
  customer: LogCustomerModel,
  order: LogOrderModel,
  error: LogErrorModel,
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildFilter(type: string, searchParams: URLSearchParams): Record<string, any> {
  const filter: Record<string, any> = {};

  const status = searchParams.get('status');
  if (status && type !== 'error' && ['success', 'error', 'skipped'].includes(status)) {
    filter.status = status;
  }

  const action = searchParams.get('action');
  if (action) {
    filter.action = action;
  }

  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) { const d = new Date(from); if (!isNaN(d.getTime())) dateFilter.$gte = d; }
    if (to)   { const d = new Date(to);   if (!isNaN(d.getTime())) { d.setHours(23, 59, 59, 999); dateFilter.$lte = d; } }
    if (Object.keys(dateFilter).length) filter.timestamp = dateFilter;
  }

  const search = searchParams.get('search');
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    if (type === 'order') {
      filter.$or = [
        { shopify_order_id: regex },
        { shopify_order_name: regex },
      ];
    } else if (type === 'customer') {
      filter.$or = [{ email: regex }];
    } else if (type === 'product') {
      filter.$or = [{ sku: regex }];
    } else if (type === 'error') {
      filter.$or = [{ flow: regex }, { error_message: regex }];
    }
  }

  return filter;
}

export async function GET(req: NextRequest) {
  await connectMongo();
  const searchParams = req.nextUrl.searchParams;
  const type = searchParams.get('type') ?? 'order';
  const page = Math.max(1, Number(searchParams.get('page') ?? 1));
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') ?? 50)));
  const skip = (page - 1) * limit;

  const ModelClass = MODEL_MAP[type];
  if (!ModelClass) return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });

  const filter = buildFilter(type, searchParams);

  try {
    const [docs, total] = await Promise.all([
      ModelClass.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      ModelClass.countDocuments(filter),
    ]);

    return NextResponse.json({
      data: docs,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching logs', error);
    return NextResponse.json({ error: 'Erro ao buscar logs' }, { status: 500 });
  }
}
