import { NextRequest, NextResponse } from 'next/server';
import {
  LogProductModel,
  LogCustomerModel,
  LogOrderModel,
  LogErrorModel,
  connectMongo,
} from '@/lib/db/mongo';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  await connectMongo();
  const searchParams = req.nextUrl.searchParams;
  const type = searchParams.get('type') ?? 'order';
  const id = searchParams.get('id');
  const pageEvents = Math.max(1, Number(searchParams.get('pageEvents') ?? 1));
  const limitEvents = Math.min(200, Math.max(1, Number(searchParams.get('limitEvents') ?? 50)));
  const pageErrors = Math.max(1, Number(searchParams.get('pageErrors') ?? 1));
  const limitErrors = Math.min(200, Math.max(1, Number(searchParams.get('limitErrors') ?? 50)));

  if (!id) return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 });

  try {
    let events = [] as any[];
    let name = id;

    if (type === 'order') {
      const filter = { shopify_order_id: id } as any;
      const [evs, total] = await Promise.all([
        LogOrderModel.find(filter).sort({ timestamp: -1 }).skip((pageEvents - 1) * limitEvents).limit(limitEvents).lean(),
        LogOrderModel.countDocuments(filter),
      ]);
      events = evs as any[];
      if (events.length) name = events[0].shopify_order_name || id;
    } else if (type === 'customer') {
      const filter = { email: id } as any;
      const [evs, total] = await Promise.all([
        LogCustomerModel.find(filter).sort({ timestamp: -1 }).skip((pageEvents - 1) * limitEvents).limit(limitEvents).lean(),
        LogCustomerModel.countDocuments(filter),
      ]);
      events = evs as any[];
      // Tentar encontrar nome nos payloads
      const firstWithPayload: any = events.find((e: any) => e.payload?.first_name);
      if (firstWithPayload) {
          name = `${firstWithPayload.payload.first_name} ${firstWithPayload.payload.last_name}`.trim();
      }
    } else if (type === 'product') {
      const filter = { sku: id } as any;
      const [evs, total] = await Promise.all([
        LogProductModel.find(filter).sort({ timestamp: -1 }).skip((pageEvents - 1) * limitEvents).limit(limitEvents).lean(),
        LogProductModel.countDocuments(filter),
      ]);
      events = evs as any[];
      const firstWithName: any = events.find((e: any) => e.after?.name || e.before?.name);
      if (firstWithName) name = firstWithName.after?.name || firstWithName.before?.name;
    } else {
      return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
    }

    // Buscar erros relacionados no LogErrorModel — por campos diretos e em payload com paginação
    const errorFilter = {
      $or: [
        { entity_id: id },
        { shopify_order_id: id },
        { email: id },
        { sku: id },
        { 'payload.id': id },
        { 'payload.shopify_order_id': id },
        { 'payload.sku': id },
        { 'payload.email': id },
        { 'payload.shopify_order_name': id },
        { 'payload.shopify_id': id },
        { 'payload.woo_id': id },
      ],
    } as any;

    const [errors, errorsTotal, eventsTotal] = await Promise.all([
      LogErrorModel.find(errorFilter).sort({ timestamp: -1 }).skip((pageErrors - 1) * limitErrors).limit(limitErrors).lean(),
      LogErrorModel.countDocuments(errorFilter),
      (async () => {
        if (type === 'order') return LogOrderModel.countDocuments({ shopify_order_id: id });
        if (type === 'customer') return LogCustomerModel.countDocuments({ email: id });
        return LogProductModel.countDocuments({ sku: id });
      })(),
    ]);

    return NextResponse.json({
      entityId: id,
      name,
      events,
      errors,
      eventsTotal,
      eventsPages: Math.ceil(eventsTotal / limitEvents),
      eventsPage: pageEvents,
      errorsTotal,
      errorsPages: Math.ceil(errorsTotal / limitErrors),
      errorsPage: pageErrors,
    });
  } catch (error) {
    console.error('Error fetching entity detail', error);
    return NextResponse.json({ error: 'Erro ao buscar detalhes' }, { status: 500 });
  }
}
