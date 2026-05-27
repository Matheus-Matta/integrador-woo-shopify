import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAuth } from '@/lib/auth/dashboard';
import { sendPushToUser, broadcastPush } from '@/lib/services/pushNotifications';

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth(req);
  if (auth) return auth;

  try {
    const body = await req.json();
    const { mode, userId, title, body: msgBody, data } = body;

    if (!title || !msgBody) {
      return NextResponse.json({ error: 'title e body são obrigatórios' }, { status: 400 });
    }

    if (mode === 'broadcast') {
      const result = await broadcastPush(title, msgBody, data);
      return NextResponse.json(result);
    }

    if (!userId) {
      return NextResponse.json({ error: 'userId é obrigatório para envio individual' }, { status: 400 });
    }

    const result = await sendPushToUser(userId, title, msgBody, data);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[push-send]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
