import type { NextRequest } from 'next/server';
import { createCustomer, listCustomers } from '@/lib/woo/customers';

export async function GET(req: NextRequest) {
  return listCustomers(req);
}

export async function POST(req: NextRequest) {
  return createCustomer(req);
}
