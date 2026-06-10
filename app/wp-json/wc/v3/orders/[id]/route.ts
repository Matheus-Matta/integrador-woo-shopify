import type { NextRequest } from 'next/server';
import { deleteOrder, getOrder, updateOrder } from '@/lib/woo/orders';

type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return getOrder(req, id);
}

export async function PUT(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return updateOrder(req, id);
}

export async function PATCH(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return updateOrder(req, id);
}

export async function DELETE(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return deleteOrder(req, id);
}
