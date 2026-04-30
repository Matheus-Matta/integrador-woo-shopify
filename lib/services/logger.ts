import {
  LogProductModel,
  LogCustomerModel,
  LogOrderModel,
  LogErrorModel,
  connectMongo,
} from '../db/mongo';
import { logEmitter, LogEvent } from './emitter';

async function ensureConnection() {
  try {
    await connectMongo();
  } catch (err) {
    console.error('[logger] Falha crítica na conexão MongoDB:', err);
    throw err;
  }
}

function emit(type: LogEvent['type'], data: Record<string, unknown>) {
  logEmitter.emit('log', { type, data, ts: new Date().toISOString() } as LogEvent);
}

// ─── Product ───────────────────────────────────────────────────────────────

export async function logProduct(data: {
  sku: string;
  action: string;
  before?: unknown;
  after?: unknown;
  shopify_response?: unknown;
  status?: 'success' | 'error' | 'skipped';
}): Promise<void> {
  try {
    await ensureConnection();
    await LogProductModel.create(data);
    emit('product', data as Record<string, unknown>);
  } catch (e: unknown) {
    console.error('[logger] Erro ao salvar log de produto:', e);
  }
}

// ─── Customer ──────────────────────────────────────────────────────────────

export async function logCustomer(data: {
  email?: string;
  shopify_customer_id?: string;
  woo_customer_id?: number;
  woo_instance?: string;
  action: string;
  webhook?: unknown;
  payload?: unknown;
  response?: unknown;
  status?: 'success' | 'error' | 'skipped';
}): Promise<void> {
  try {
    await ensureConnection();
    await LogCustomerModel.create(data);
    emit('customer', data as Record<string, unknown>);
  } catch (e: unknown) {
    console.error('[logger] Erro ao salvar log de cliente:', e);
  }
}

// ─── Order ─────────────────────────────────────────────────────────────────

export async function logOrder(data: {
  shopify_order_id?: string;
  shopify_order_name?: string;
  woo_order_id?: number;
  woo_instance?: string;
  action: string;
  webhook?: unknown;
  payload?: unknown;
  response?: unknown;
  status?: 'success' | 'error' | 'skipped';
}): Promise<void> {
  try {
    await ensureConnection();
    await LogOrderModel.create(data);
    emit('order', data as Record<string, unknown>);
  } catch (e: unknown) {
    console.error('[logger] Erro ao salvar log de pedido:', e);
  }
}

// ─── Error ─────────────────────────────────────────────────────────────────

export async function logError(data: {
  flow: string;
  error_message?: string;
  stack?: string;
  payload?: unknown;
  entity_type?: 'order' | 'product' | 'customer';
  entity_id?: string;
  shopify_order_id?: string;
  woo_order_id?: number;
  email?: string;
  sku?: string;
}): Promise<void> {
  try {
    await ensureConnection();
    await LogErrorModel.create(data);
    emit('error', data as Record<string, unknown>);
  } catch (e: unknown) {
    console.error('[logger] Erro ao salvar log de erro:', e);
  }
}

