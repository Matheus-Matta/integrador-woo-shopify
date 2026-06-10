import type { NextRequest } from 'next/server';
import { batchOrders } from '@/lib/woo/orders';

export async function POST(req: NextRequest) {
  return batchOrders(req);
}
