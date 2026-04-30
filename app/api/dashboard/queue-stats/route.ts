import { NextResponse } from 'next/server';
import { ordersQueue, productsQueue } from '@/lib/queue/queues';

export const dynamic = 'force-dynamic';

export async function GET() {
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
