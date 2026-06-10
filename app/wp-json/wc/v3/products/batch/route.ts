import type { NextRequest } from 'next/server';
import { batchProducts } from '@/lib/woo/products';

export async function POST(req: NextRequest) {
  return batchProducts(req);
}
