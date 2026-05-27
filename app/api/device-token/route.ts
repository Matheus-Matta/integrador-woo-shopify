import { NextRequest, NextResponse } from 'next/server';
import { connectMongo, DeviceTokenModel } from '@/lib/db/mongo';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, platform, userId, label } = body;

    // Apenas o token é obrigatório — userId é opcional (vinculado após login)
    if (!token) {
      return NextResponse.json({ error: 'token é obrigatório' }, { status: 400 });
    }

    await connectMongo();

    await DeviceTokenModel.findOneAndUpdate(
      { token },                                              // upsert pela chave única do token
      {
        platform: platform ?? 'unknown',
        label: label ?? '',
        updatedAt: new Date(),
        ...(userId != null ? { userId } : {}),              // só vincula userId se vier na requisição
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[device-token]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
