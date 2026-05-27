import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAuth } from '@/lib/auth/dashboard';
import { connectMongo, NotificationTemplateModel, NotificationScheduleModel } from '@/lib/db/mongo';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireDashboardAuth(req);
  if (auth) return auth;

  const { id } = await params;

  await connectMongo();

  // Verifica se há agendamentos usando este template
  const scheduleCount = await NotificationScheduleModel.countDocuments({ templateId: id });
  if (scheduleCount > 0) {
    return NextResponse.json(
      { error: `Não é possível excluir: ${scheduleCount} agendamento(s) usam este modelo. Exclua os agendamentos primeiro.` },
      { status: 409 }
    );
  }

  const result = await NotificationTemplateModel.findByIdAndDelete(id);
  if (!result) return NextResponse.json({ error: 'Modelo não encontrado' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
