import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAuth } from '@/lib/auth/dashboard';
import { connectMongo, NotificationScheduleModel, NotificationTemplateModel } from '@/lib/db/mongo';
import { getNotificationsQueue } from '@/lib/queue/queues';
import { getFrequencyRepeatOpts } from '@/lib/services/pushNotifications';

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth(req);
  if (auth) return auth;

  await connectMongo();
  const schedules = await NotificationScheduleModel.find({}).sort({ createdAt: -1 }).lean();
  return NextResponse.json(schedules);
}

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth(req);
  if (auth) return auth;

  try {
    const { templateId, mode, userId, frequency, lgpdConsent } = await req.json();

    if (!templateId || !mode || !frequency) {
      return NextResponse.json({ error: 'templateId, mode e frequency são obrigatórios' }, { status: 400 });
    }

    if (!lgpdConsent) {
      return NextResponse.json({ error: 'É necessário confirmar o consentimento LGPD' }, { status: 400 });
    }

    if (mode === 'individual' && !userId?.trim()) {
      return NextResponse.json({ error: 'userId é obrigatório para envio individual' }, { status: 400 });
    }

    const repeatOpts = getFrequencyRepeatOpts(frequency);
    if (!repeatOpts) {
      return NextResponse.json({ error: 'Frequência inválida' }, { status: 400 });
    }

    await connectMongo();

    const template = await NotificationTemplateModel.findById(templateId).lean();
    if (!template) return NextResponse.json({ error: 'Modelo não encontrado' }, { status: 404 });

    const schedule = await NotificationScheduleModel.create({
      templateId,
      templateName: template.name,
      mode,
      userId: userId?.trim() ?? '',
      frequency,
      lgpdConsent,
      active: true,
    });

    // Adiciona job recorrente no BullMQ
    const q = getNotificationsQueue();
    const jobName = `push:${schedule._id.toString()}`;
    await q.add(jobName, { scheduleId: schedule._id.toString() }, { repeat: repeatOpts });

    // Recupera a key do job recorrente para permitir remoção futura
    const repeatableJobs = await q.getRepeatableJobs();
    const repeatJob = repeatableJobs.find((j) => j.name === jobName);
    if (repeatJob?.key) {
      await NotificationScheduleModel.findByIdAndUpdate(schedule._id, { repeatKey: repeatJob.key });
    }

    return NextResponse.json(schedule, { status: 201 });
  } catch (error) {
    console.error('[push-schedules POST]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
