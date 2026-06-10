import type { NextRequest } from 'next/server';
import { deleteResource, getResource, updateResource } from '@/lib/woo/resources';

type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return getResource(req, 'categories', id);
}

export async function PUT(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return updateResource(req, 'categories', id);
}

export async function PATCH(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return updateResource(req, 'categories', id);
}

export async function DELETE(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return deleteResource(req, 'categories', id);
}
