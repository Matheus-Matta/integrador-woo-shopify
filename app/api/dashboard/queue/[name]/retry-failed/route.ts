import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAuth } from '@/lib/auth/dashboard';
import { ordersQueue, productsQueue } from '@/lib/queue/queues';

export async function POST(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const auth = await requireDashboardAuth(req);
  if (auth) return auth;

  const { name } = await params;

  const queue = name === 'orders' ? ordersQueue : (name === 'products' ? productsQueue : null);
  
  if (!queue) {
    return NextResponse.json({ error: 'Fila inválida' }, { status: 400 });
  }

  try {
    const failed = await queue.getFailed();
    await Promise.all(failed.map((job) => job.retry()));

    return NextResponse.json({ retriedCount: failed.length });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao tentar reiniciar os jobs' }, { status: 500 });
  }
}
