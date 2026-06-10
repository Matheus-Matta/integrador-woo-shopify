import type { NextRequest } from 'next/server';
import { deleteOrderSubresource, getOrderSubresource } from '@/lib/woo/order-subresources';

type Context = { params: Promise<{ id: string; note_id: string }> };

export async function GET(req: NextRequest, context: Context) {
  const { id, note_id } = await context.params;
  return getOrderSubresource(req, 'notes', id, note_id);
}

export async function DELETE(req: NextRequest, context: Context) {
  const { id, note_id } = await context.params;
  return deleteOrderSubresource(req, 'notes', id, note_id);
}
