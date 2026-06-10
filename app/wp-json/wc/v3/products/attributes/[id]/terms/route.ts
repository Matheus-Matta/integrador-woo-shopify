import type { NextRequest } from 'next/server';
import { createResource, listResources } from '@/lib/woo/resources';

type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return listResources(req, 'attribute_terms', Number(id));
}

export async function POST(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return createResource(req, 'attribute_terms', Number(id));
}
