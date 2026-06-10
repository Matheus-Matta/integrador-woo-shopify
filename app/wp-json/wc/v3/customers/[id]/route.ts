import type { NextRequest } from 'next/server';
import { deleteCustomer, getCustomer, updateCustomer } from '@/lib/woo/customers';

type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return getCustomer(req, id);
}

export async function PUT(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return updateCustomer(req, id);
}

export async function PATCH(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return updateCustomer(req, id);
}

export async function DELETE(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return deleteCustomer(req, id);
}
