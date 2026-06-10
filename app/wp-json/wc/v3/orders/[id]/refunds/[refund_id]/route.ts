import type { NextRequest } from 'next/server';
import { deleteOrderSubresource, getOrderSubresource } from '@/lib/woo/order-subresources';

type Context = { params: Promise<{ id: string; refund_id: string }> };

export async function GET(req: NextRequest, context: Context) {
  const { id, refund_id } = await context.params;
  return getOrderSubresource(req, 'refunds', id, refund_id);
}

export async function DELETE(req: NextRequest, context: Context) {
  const { id, refund_id } = await context.params;
  return deleteOrderSubresource(req, 'refunds', id, refund_id);
}
