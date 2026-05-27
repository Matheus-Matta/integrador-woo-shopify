import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAuth } from '@/lib/auth/dashboard';
import { connectMongo, DeviceTokenModel } from '@/lib/db/mongo';

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth(req);
  if (auth) return auth;

  await connectMongo();
  const tokens = await DeviceTokenModel.find({}).sort({ createdAt: -1 }).lean();
  return NextResponse.json(tokens);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireDashboardAuth(req);
  if (auth) return auth;

  await connectMongo();
  const { count } = await DeviceTokenModel.deleteMany({}).then((r) => ({ count: r.deletedCount }));
  return NextResponse.json({ ok: true, deleted: count });
}
