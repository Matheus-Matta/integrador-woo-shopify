import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAuth } from '@/lib/auth/dashboard';
import { connectMongo, PushNotificationLogModel } from '@/lib/db/mongo';

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth(req);
  if (auth) return auth;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);

  await connectMongo();
  const history = await PushNotificationLogModel.find({})
    .sort({ sentAt: -1 })
    .limit(limit)
    .lean();

  return NextResponse.json(history);
}
