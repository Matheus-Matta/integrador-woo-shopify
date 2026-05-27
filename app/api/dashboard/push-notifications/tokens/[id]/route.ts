import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAuth } from '@/lib/auth/dashboard';
import { connectMongo, DeviceTokenModel } from '@/lib/db/mongo';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireDashboardAuth(req);
  if (auth) return auth;

  const { id } = await params;

  await connectMongo();
  const result = await DeviceTokenModel.findByIdAndDelete(id);
  if (!result) {
    return NextResponse.json({ error: 'Token não encontrado' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
