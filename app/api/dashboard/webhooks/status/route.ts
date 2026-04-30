import { NextResponse } from 'next/server';
import { getAllWebhooksStatus } from '@/lib/services/webhooksManager';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await getAllWebhooksStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
