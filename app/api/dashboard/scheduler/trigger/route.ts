import { NextResponse } from 'next/server';
import { runSyncCheck, runDailySync } from '../../../../../lib/scheduler/syncChecker';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { type } = await request.json();

    if (type === 'orders') {
      console.log('[API] Disparo manual de sincronização de pedidos solicitado.');
      // Não damos await para não travar o frontend em operações longas
      void runSyncCheck();
      return NextResponse.json({ success: true, message: 'Sincronização de pedidos iniciada em background.' });
    }

    if (type === 'products') {
      console.log('[API] Disparo manual de sincronização diária de produtos solicitado.');
      void runDailySync();
      return NextResponse.json({ success: true, message: 'Sincronização diária de produtos iniciada em background.' });
    }

    return NextResponse.json({ error: 'Tipo de sincronização inválido' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
