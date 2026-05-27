import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAuth } from '@/lib/auth/dashboard';
import { connectMongo, NotificationTemplateModel } from '@/lib/db/mongo';

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth(req);
  if (auth) return auth;

  await connectMongo();
  const templates = await NotificationTemplateModel.find({}).sort({ createdAt: -1 }).lean();
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth(req);
  if (auth) return auth;

  try {
    const { name, title, body, url } = await req.json();
    if (!name?.trim() || !title?.trim() || !body?.trim()) {
      return NextResponse.json({ error: 'name, title e body são obrigatórios' }, { status: 400 });
    }

    await connectMongo();
    const template = await NotificationTemplateModel.create({ name: name.trim(), title: title.trim(), body: body.trim(), url: url?.trim() ?? '' });
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error('[push-templates POST]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
