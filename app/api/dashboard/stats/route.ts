import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAuth } from '@/lib/auth/dashboard';
import {
  connectMongo,
  LogOrderModel,
  LogProductModel,
  LogCustomerModel,
  LogErrorModel,
} from '@/lib/db/mongo';
import type { DayStat } from '@/types';

export const dynamic = 'force-dynamic';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseSummaryAgg(agg: { _id: { period: string; status: string }; count: number }[]): {
  today: DayStat;
  yesterday: DayStat;
} {
  const result = {
    today:     { success: 0, error: 0 },
    yesterday: { success: 0, error: 0 },
  };
  for (const item of agg) {
    const { period, status } = item._id;
    if ((period === 'today' || period === 'yesterday') && (status === 'success' || status === 'error')) {
      result[period][status] = item.count;
    }
  }
  return result;
}

/**
 * Formats a JS Date into "YYYY-MM-DDTHH:00:00" using the given IANA timezone.
 * Used to generate gap-fill keys that match MongoDB's $dateToString output.
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

  const tz        = process.env.TZ ?? 'America/Sao_Paulo';
  const now       = new Date();
  const todayStart     = startOfToday();
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  // ── Determine chart window and granularity ────────────────────────────────
  let chartStart: Date;
  let chartEnd: Date = now;           // upper bound for chart queries — always ≤ now
  let bucketStart: Date | null = null; // rounded lower bound for hourly gap-fill
  let granularity: 'hour' | 'day' = 'day';
  let periodDays = 30;

  if (hoursParam) {
    // ── 24h mode ────────────────────────────────────────────────────────────
    // Full unrounded window — no data is excluded due to rounding.
    const hours = Math.min(48, Math.max(1, Number(hoursParam)));
    chartStart   = new Date(now);
    chartStart.setHours(chartStart.getHours() - hours);

    bucketStart  = floorHour(new Date(chartStart)); // rounded DOWN for clean buckets
    granularity  = 'hour';
    periodDays   = 1;

  } else if (fromParam && toParam) {
    // ── Custom date range ─────────────────────────────────────────────────────
    // Parse as UTC (append 'Z') for platform-independent behaviour.
    chartStart  = new Date(fromParam + 'T00:00:00.000Z');
    chartEnd    = new Date(toParam   + 'T23:59:59.999Z');
    periodDays  = Math.max(1, Math.ceil((chartEnd.getTime() - chartStart.getTime()) / 864e5));

  } else {
    // ── Last N days (default) ─────────────────────────────────────────────────
    periodDays  = Math.min(30, Math.max(1, Number(daysParam ?? 30)));
    chartStart  = new Date(todayStart);
    chartStart.setDate(chartStart.getDate() - periodDays);
  }

  const groupKey = granularity === 'hour'
    ? { $dateToString: { format: '%Y-%m-%dT%H:00:00', date: '$timestamp', timezone: tz } }
    : { $dateToString: { format: '%Y-%m-%d',           date: '$timestamp', timezone: tz } };

  const periodExpr = { $cond: [{ $gte: ['$timestamp', todayStart] }, 'today', 'yesterday'] };

  await connectMongo();

  try {
    const [
      orderAgg, productAgg, customerAgg,
      errorsToday, errorsYesterday,
      chartOrders, chartProducts, chartCustomers, chartErrors,
    ] = await Promise.all([
      // ── Summary (always today vs yesterday, unaffected by filter) ─────────
      LogOrderModel.aggregate([
        { $match: { timestamp: { $gte: yesterdayStart } } },
        { $group: { _id: { period: periodExpr, status: '$status' }, count: { $sum: 1 } } },
      ]),
      LogProductModel.aggregate([
        { $match: { timestamp: { $gte: yesterdayStart } } },
        { $group: { _id: { period: periodExpr, status: '$status' }, count: { $sum: 1 } } },
      ]),
      LogCustomerModel.aggregate([
        { $match: { timestamp: { $gte: yesterdayStart } } },
        { $group: { _id: { period: periodExpr, status: '$status' }, count: { $sum: 1 } } },
      ]),
      LogErrorModel.countDocuments({ timestamp: { $gte: todayStart } }),
      LogErrorModel.countDocuments({ timestamp: { $gte: yesterdayStart, $lt: todayStart } }),

      // ── Chart data (respects filter window) ──────────────────────────────
      LogOrderModel.aggregate([
        { $match: { timestamp: { $gte: chartStart, $lte: chartEnd } } },
        { $group: {
          _id:         groupKey,
          orders:      { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
          orderErrors: { $sum: { $cond: [{ $eq: ['$status', 'error'] },   1, 0] } },
        }},
        { $sort: { _id: 1 } },
      ]),
      LogProductModel.aggregate([
        { $match: { timestamp: { $gte: chartStart, $lte: chartEnd }, status: 'success' } },
        { $group: { _id: groupKey, products: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      LogCustomerModel.aggregate([
        { $match: { timestamp: { $gte: chartStart, $lte: chartEnd }, status: 'success' } },
        { $group: { _id: groupKey, customers: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      LogErrorModel.aggregate([
        { $match: { timestamp: { $gte: chartStart, $lte: chartEnd } } },
        { $group: { _id: groupKey, errors: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    // ── Gap-fill chart map ────────────────────────────────────────────────────
    const chartMap: Record<string, {
      date: string; orders: number; orderErrors: number;
      products: number; customers: number; errors: number;
    }> = {};

    if (granularity === 'hour') {
      // Buckets from bucketStart to the current full hour (inclusive)
      const currentHourStart = floorHour(new Date(now));
      const start = bucketStart ?? floorHour(new Date(chartStart));
      let d = new Date(start);
      while (d <= currentHourStart) {
        chartMap[formatHourKey(d, tz)] = { date: formatHourKey(d, tz), orders: 0, orderErrors: 0, products: 0, customers: 0, errors: 0 };
        d = new Date(d);
        d.setHours(d.getHours() + 1);
      }
    } else {
      for (let i = 0; i < periodDays; i++) {
        const d = new Date(chartStart);
        d.setDate(d.getDate() + i);
        const key = d.toISOString().split('T')[0];
        chartMap[key] = { date: key, orders: 0, orderErrors: 0, products: 0, customers: 0, errors: 0 };
      }
    }

    for (const item of chartOrders)   { if (chartMap[item._id]) { chartMap[item._id].orders = item.orders; chartMap[item._id].orderErrors = item.orderErrors; } }
    for (const item of chartProducts)  { if (chartMap[item._id]) chartMap[item._id].products  = item.products;  }
    for (const item of chartCustomers) { if (chartMap[item._id]) chartMap[item._id].customers = item.customers; }
    for (const item of chartErrors)    { if (chartMap[item._id]) chartMap[item._id].errors    = item.errors;    }

    return NextResponse.json({
      granularity,
      summary: {
        orders:    parseSummaryAgg(orderAgg),
        products:  parseSummaryAgg(productAgg),
        customers: parseSummaryAgg(customerAgg),
        errors:    { today: errorsToday, yesterday: errorsYesterday },
      },
      chart: Object.values(chartMap).sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (error) {
    console.error('[dashboard/stats]', error);
    return NextResponse.json({ error: 'Erro ao buscar estatísticas' }, { status: 500 });
  }
}
