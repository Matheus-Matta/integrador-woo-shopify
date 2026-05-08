import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAuth } from '@/lib/auth/dashboard';
import { ordersQueue, productsQueue } from '@/lib/queue/queues';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth(req);
  if (auth) return auth;

  try {
    const [orderCounts, productCounts] = await Promise.all([
      ordersQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      productsQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
    ]);

    return NextResponse.json({
      orders: orderCounts,
      products: productCounts,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao buscar stats da fila' }, { status: 500 });
  }
}
