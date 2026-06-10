import type { NextRequest } from 'next/server';
import { createOrderSubresource, listOrderSubresources } from '@/lib/woo/order-subresources';

type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return listOrderSubresources(req, 'refunds', id);
}

export async function POST(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return createOrderSubresource(req, 'refunds', id);
}
