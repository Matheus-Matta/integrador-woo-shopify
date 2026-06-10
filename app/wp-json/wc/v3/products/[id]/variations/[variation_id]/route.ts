import type { NextRequest } from 'next/server';
import { deleteVariation, getVariation, updateVariation } from '@/lib/woo/variations';

type Context = { params: Promise<{ id: string; variation_id: string }> };

export async function GET(req: NextRequest, context: Context) {
  const { id, variation_id } = await context.params;
  return getVariation(req, id, variation_id);
}

export async function PUT(req: NextRequest, context: Context) {
  const { id, variation_id } = await context.params;
  return updateVariation(req, id, variation_id);
}

export async function PATCH(req: NextRequest, context: Context) {
  const { id, variation_id } = await context.params;
  return updateVariation(req, id, variation_id);
}

export async function DELETE(req: NextRequest, context: Context) {
  const { id, variation_id } = await context.params;
  return deleteVariation(req, id, variation_id);
}
