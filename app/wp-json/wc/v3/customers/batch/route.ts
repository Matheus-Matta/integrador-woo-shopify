import type { NextRequest } from 'next/server';
import { batchCustomers } from '@/lib/woo/customers';

export async function POST(req: NextRequest) {
  return batchCustomers(req);
}
