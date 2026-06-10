import type { NextRequest } from 'next/server';
import { createResource, listResources } from '@/lib/woo/resources';

export async function GET(req: NextRequest) {
  return listResources(req, 'attributes');
}

export async function POST(req: NextRequest) {
  return createResource(req, 'attributes');
}
