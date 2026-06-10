import type { NextRequest } from 'next/server';
import { deleteProduct, getProduct, updateProduct } from '@/lib/woo/products';

type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return getProduct(req, id);
}

export async function PUT(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return updateProduct(req, id);
}

export async function PATCH(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return updateProduct(req, id);
}

export async function DELETE(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return deleteProduct(req, id);
}
