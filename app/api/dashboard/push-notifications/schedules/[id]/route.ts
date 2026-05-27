import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAuth } from '@/lib/auth/dashboard';
import { connectMongo, NotificationScheduleModel } from '@/lib/db/mongo';
import { getNotificationsQueue } from '@/lib/queue/queues';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireDashboardAuth(req);
  if (auth) return auth;

  const { id } = await params;
  await connectMongo();

  const schedule = await NotificationScheduleModel.findById(id).lean();
  if (!schedule) return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 });

  // Remove o job recorrente do BullMQ
  if (schedule.repeatKey) {
    try {
      const q = getNotificationsQueue();
      await q.removeRepeatableByKey(schedule.repeatKey as string);
    } catch (e) {
      console.warn('[push-schedules DELETE] Falha ao remover job do BullMQ:', e);
    }
  }

  await NotificationScheduleModel.findByIdAndDelete(id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireDashboardAuth(req);
  if (auth) return auth;

  const { id } = await params;
  const { active } = await req.json();

  await connectMongo();
  const schedule = await NotificationScheduleModel.findByIdAndUpdate(
    id,
    { active: Boolean(active) },
    { new: true }
  ).lean();

  if (!schedule) return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 });
  return NextResponse.json(schedule);
}
