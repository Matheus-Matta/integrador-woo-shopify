import { NextRequest, NextResponse } from 'next/server';
import {
  LogProductModel,
  LogCustomerModel,
  LogOrderModel,
  connectMongo,
} from '@/lib/db/mongo';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  await connectMongo();
  const searchParams = req.nextUrl.searchParams;
  const type = searchParams.get('type') ?? 'order';
  const page = Math.max(1, Number(searchParams.get('page') ?? 1));
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') ?? 50)));
  const search = searchParams.get('search');

  let model;
  let groupField;
  let nameFieldExpression;

  if (type === 'order') {
    model = LogOrderModel;
    groupField = '$shopify_order_id';
    nameFieldExpression = { $first: '$shopify_order_name' };
  } else if (type === 'customer') {
    model = LogCustomerModel;
    groupField = '$email';
    // No schema-level name, but maybe in payload
    nameFieldExpression = { $first: '$email' }; 
  } else if (type === 'product') {
    model = LogProductModel;
    groupField = '$sku';
    nameFieldExpression = { 
      $first: {
        $ifNull: ['$after.name', { $ifNull: ['$before.name', '$sku'] }]
      }
    };
  } else {
    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
  }

  const pipeline: any[] = [];

  // Match search if present
  if (search) {
    if (type === 'order') {
      pipeline.push({
        $match: {
          $or: [
            { shopify_order_id: { $regex: search, $options: 'i' } },
            { shopify_order_name: { $regex: search, $options: 'i' } },
          ],
        },
      });
    } else if (type === 'customer') {
      pipeline.push({
        $match: {
          email: { $regex: search, $options: 'i' },
        },
      });
    } else if (type === 'product') {
      pipeline.push({
        $match: {
          sku: { $regex: search, $options: 'i' },
        },
      });
    }
  }

  // Group by ID
  pipeline.push({
    $group: {
      _id: groupField,
      lastTimestamp: { $max: '$timestamp' },
      count: { $sum: 1 },
      name: nameFieldExpression,
      woo_order_id: { $max: '$woo_order_id' },
      statuses: { $push: '$status' }
    }
  });

  // Sort by last update
  pipeline.push({ $sort: { lastTimestamp: -1 } });

  // Pagination
  const totalPipeline = [...pipeline, { $count: 'total' }];
  const dataPipeline = [...pipeline, { $skip: (page - 1) * limit }, { $limit: limit }];

  try {
    const [totalRes, docs] = await Promise.all([
      model.aggregate(totalPipeline),
      model.aggregate(dataPipeline),
    ]);

    const total = totalRes[0]?.total || 0;

    const data = docs.map((doc: any) => ({
      id: doc._id || '—',
      name: doc.name || doc._id || '—',
      wooOrderId: doc.woo_order_id,
      lastTimestamp: doc.lastTimestamp,
      count: doc.count,
      status: doc.statuses.includes('error') ? 'error' : (doc.statuses.includes('skipped') ? 'skipped' : 'success')
    }));

    return NextResponse.json({
      data,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching entity logs', error);
    return NextResponse.json({ error: 'Erro ao buscar entidades' }, { status: 500 });
  }
}
