import type { NextRequest } from 'next/server';
import { createOrder, listOrders } from '@/lib/woo/orders';

export async function GET(req: NextRequest) {
  return listOrders(req);
}

export async function POST(req: NextRequest) {
  return createOrder(req);
}
