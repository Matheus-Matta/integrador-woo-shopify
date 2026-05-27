import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAuth } from '@/lib/auth/dashboard';
import { connectMongo, DeviceTokenModel, PushNotificationLogModel, NotificationScheduleModel } from '@/lib/db/mongo';

export const dynamic = 'force-dynamic';

/**
 * Formats a JS Date into "YYYY-MM-DDTHH:00:00" using the given IANA timezone.
 * Matches MongoDB's $dateToString output for hourly grouping.
 */
function formatHourKey(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(date);
  const year  = parts.find(p => p.type === 'year')?.value  ?? '2000';
  const month = parts.find(p => p.type === 'month')?.value ?? '01';
  const day   = parts.find(p => p.type === 'day')?.value   ?? '01';
  const raw   = parts.find(p => p.type === 'hour')?.value  ?? '00';
  const hour  = raw === '24' ? '00' : raw;
  return `${year}-${month}-${day}T${hour}:00:00`;
}

/** Round a Date down to the nearest full hour (mutates in place). */
function floorHour(d: Date): Date {
  d.setMinutes(0, 0, 0);
  return d;
}

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth(req);
  if (auth) return auth;

  const sp         = req.nextUrl.searchParams;
  const hoursParam = sp.get('hours');
  const fromParam  = sp.get('from');
  const toParam    = sp.get('to');
  const daysParam  = sp.get('days');

  const tz  = process.env.TZ ?? 'America/Sao_Paulo';
  const now = new Date();

  // ── Determine window and granularity ────────────────────────────────────────
  let cutoff: Date;
  let cutoffEnd: Date = now;            // upper bound for queries — always ≤ now
  let bucketStart: Date | null = null;  // rounded lower bound for gap-fill
  let granularity: 'hour' | 'day' = 'day';
  let periodDays = 30;

  if (hoursParam) {
    // ── 24h mode ──────────────────────────────────────────────────────────────
    // Query the full window [now - hours, now] — no rounding on the query bounds.
    // Gap-fill uses hourly buckets starting at the nearest full hour ≤ cutoff.
    const hours = Math.min(48, Math.max(1, Number(hoursParam)));
    cutoff      = new Date(now);
    cutoff.setHours(cutoff.getHours() - hours);

    bucketStart = floorHour(new Date(cutoff)); // rounded DOWN for clean buckets
    granularity = 'hour';
    periodDays  = 1;

  } else if (fromParam && toParam) {
    // ── Custom date range ────────────────────────────────────────────────────
    // Append 'Z' to parse as UTC. This is platform-independent.
    // UTC midnight of from-date → UTC 23:59:59.999 of to-date.
    cutoff    = new Date(fromParam + 'T00:00:00.000Z');
    cutoffEnd = new Date(toParam   + 'T23:59:59.999Z');
    periodDays = Math.max(1, Math.ceil((cutoffEnd.getTime() - cutoff.getTime()) / 864e5));

  } else {
    // ── Last N days (default) ─────────────────────────────────────────────────
    periodDays = Math.min(90, Math.max(1, Number(daysParam ?? 30)));
    cutoff     = new Date(now);
    cutoff.setDate(cutoff.getDate() - periodDays);
  }

  const groupKey = granularity === 'hour'
    ? { $dateToString: { format: '%Y-%m-%dT%H:00:00', date: '$createdAt', timezone: tz } }
    : { $dateToString: { format: '%Y-%m-%d',           date: '$createdAt', timezone: tz } };

  await connectMongo();

  try {
    const [
      totalDevices,
      devicesWithUser,
      newDevices,
      devicesByPeriod,
      totalLogs,
      scheduledLogs,
      logsByTemplate,
      activeSchedules,
    ] = await Promise.all([
      // Total geral (sem filtro de período)
      DeviceTokenModel.countDocuments(),
      DeviceTokenModel.countDocuments({ userId: { $ne: null, $exists: true } }),

      // Novos no período
      DeviceTokenModel.countDocuments({ createdAt: { $gte: cutoff, $lte: cutoffEnd } }),

      // Novos por hora ou dia
      DeviceTokenModel.aggregate([
        { $match: { createdAt: { $gte: cutoff, $lte: cutoffEnd } } },
        { $group: { _id: groupKey, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),

      // Notificações enviadas no período
      PushNotificationLogModel.countDocuments({ sentAt: { $gte: cutoff, $lte: cutoffEnd } }),
      PushNotificationLogModel.countDocuments({
        sentAt: { $gte: cutoff, $lte: cutoffEnd },
        sentBy: { $in: ['schedule', 'schedule-broadcast'] },
      }),

      // Top 10 por template
      PushNotificationLogModel.aggregate([
        { $match: { sentAt: { $gte: cutoff, $lte: cutoffEnd } } },
        {
          $group: {
            _id: '$title',
            sends: { $sum: 1 },
            recipients: {
              $sum: { $cond: [{ $isArray: '$to' }, { $size: '$to' }, 1] },
            },
          },
        },
        { $sort: { sends: -1 } },
        { $limit: 10 },
      ]),

      NotificationScheduleModel.countDocuments({ active: true }),
    ]);

    // ── Gap-fill period map ───────────────────────────────────────────────────
    const periodMap: Record<string, number> = {};

    if (granularity === 'hour') {
      // Hourly buckets from bucketStart to the current full hour (inclusive)
      const currentHourStart = floorHour(new Date(now));
      const start = bucketStart ?? floorHour(new Date(cutoff));
      let d = new Date(start);
      while (d <= currentHourStart) {
        periodMap[formatHourKey(d, tz)] = 0;
        d = new Date(d);
        d.setHours(d.getHours() + 1);
      }
    } else {
      for (let i = 0; i < periodDays; i++) {
        const d = new Date(cutoff);
        d.setDate(d.getDate() + i);
        // Use UTC date key for custom-range (parsed from UTC) or local for relative
        const key = fromParam ? d.toISOString().split('T')[0] : d.toISOString().split('T')[0];
        periodMap[key] = 0;
      }
    }

    for (const item of devicesByPeriod) {
      if (periodMap[item._id] !== undefined) periodMap[item._id] = item.count;
    }

    return NextResponse.json({
      granularity,
      period: periodDays,
      devices: {
        total:       totalDevices,
        withUserId:  devicesWithUser,
        anonymous:   totalDevices - devicesWithUser,
        newInPeriod: newDevices,
        byPeriod: Object.entries(periodMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, count]) => ({ date, count })),
      },
      notifications: {
        totalSent:      totalLogs,
        scheduledSent:  scheduledLogs,
        manualSent:     totalLogs - scheduledLogs,
        activeSchedules,
        byTemplate: logsByTemplate.map((t: { _id: string; sends: number; recipients: number }) => ({
          title:      t._id,
          sends:      t.sends,
          recipients: t.recipients,
        })),
      },
    });
  } catch (error) {
    console.error('[push/report]', error);
    return NextResponse.json({ error: 'Erro ao gerar relatório' }, { status: 500 });
  }
}
