import { NextResponse } from 'next/server';
import { config, updateDynamicConfig } from '@/lib/config';
import { restartSyncScheduler } from '@/lib/scheduler/syncChecker';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({
      active: config.scheduler.active,
      intervalMs: config.scheduler.intervalMs,
      lookbackHours: config.scheduler.lookbackHours,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const newActive = body.active !== undefined ? Boolean(body.active) : config.scheduler.active;
    const newIntervalMs = body.intervalMs !== undefined ? Number(body.intervalMs) : config.scheduler.intervalMs;
    const newLookbackHours = body.lookbackHours !== undefined ? Number(body.lookbackHours) : config.scheduler.lookbackHours;

    updateDynamicConfig({
      scheduler: {
        active: newActive,
        intervalMs: newIntervalMs,
        lookbackHours: newLookbackHours,
      }
    });

    // Apply immediately
    restartSyncScheduler();

    return NextResponse.json({ success: true, scheduler: config.scheduler });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
