import type { NextRequest } from 'next/server';
import { deleteResource, getResource, updateResource } from '@/lib/woo/resources';

type Context = { params: Promise<{ id: string; term_id: string }> };

export async function GET(req: NextRequest, context: Context) {
  const { id, term_id } = await context.params;
  return getResource(req, 'attribute_terms', term_id, Number(id));
}

export async function PUT(req: NextRequest, context: Context) {
  const { id, term_id } = await context.params;
  return updateResource(req, 'attribute_terms', term_id, Number(id));
}

export async function PATCH(req: NextRequest, context: Context) {
  const { id, term_id } = await context.params;
  return updateResource(req, 'attribute_terms', term_id, Number(id));
}

export async function DELETE(req: NextRequest, context: Context) {
  const { id, term_id } = await context.params;
  return deleteResource(req, 'attribute_terms', term_id, Number(id));
}
