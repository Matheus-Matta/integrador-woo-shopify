import type { NextRequest } from 'next/server';
import { createProduct, listProducts } from '@/lib/woo/products';

export async function GET(req: NextRequest) {
  return listProducts(req);
}

export async function POST(req: NextRequest) {
  return createProduct(req);
}
