import type { NextRequest } from 'next/server';
import { createVariation, listVariations } from '@/lib/woo/variations';

type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return listVariations(req, id);
}

export async function POST(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return createVariation(req, id);
}
