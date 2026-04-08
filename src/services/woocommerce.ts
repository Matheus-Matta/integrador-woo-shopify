import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { cacheGet, cacheSet, cacheDel } from '../db/redis';

// ─── Instâncias HTTP ────────────────────────────────────────────────────────

function makeWooClient(
  baseURL: string,
  consumerKey: string,
  consumerSecret: string,
): AxiosInstance {
  return axios.create({
    baseURL,
    auth: { username: consumerKey, password: consumerSecret },
    headers: { 'Content-Type': 'application/json' },
    timeout: 30_000,
  });
}

export type WooInstance = 'starchats' | 'starseguro';

function getClient(_instance: WooInstance): AxiosInstance {
  return makeWooClient(config.woo.url, config.woo.key, config.woo.secret);
}

// ─── Tipos ─────────────────────────────────────────────────────────────────

export interface WooCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  billing?: Record<string, string>;
  shipping?: Record<string, string>;
  meta_data?: { key: string; value: string }[];
}

export interface WooOrder {
  id: number;
  status: string;
  meta_data?: { key: string; value: unknown }[];
  line_items?: {
    id: number;
    name: string;
    sku: string;
    quantity: number;
    total: string;
    meta_data?: { key: string; value: unknown }[];
  }[];
  shipping_lines?: {
    id?: number;
    method_id: string;
    method_title: string;
    total: string;
    total_tax?: string;
    taxes?: unknown[];
  }[];
}

// ─── Clientes ──────────────────────────────────────────────────────────────

export async function getCustomerByEmail(
  instance: WooInstance,
  email: string,
): Promise<WooCustomer | null> {
  const cacheKey = `woo:${instance}:customer:${email.toLowerCase()}`;
  const cached = await cacheGet<WooCustomer>(cacheKey);
  if (cached) return cached;

  const client = getClient(instance);
  const { data } = await client.get<WooCustomer[]>('/wp-json/wc/v3/customers', {
    params: { email },
  });

  const customer = Array.isArray(data) && data.length > 0 ? data[0] : null;
  if (customer) await cacheSet(cacheKey, customer, 600); // 10 min
  return customer;
}

export async function createCustomer(
  instance: WooInstance,
  payload: Record<string, unknown>,
): Promise<WooCustomer> {
  const client = getClient(instance);
  const { data } = await client.post<WooCustomer>('/wp-json/wc/v3/customers', payload);
  // Invalida cache ao criar
  if (data.email) await cacheDel(`woo:${instance}:customer:${data.email.toLowerCase()}`);
  return data;
}

export async function updateCustomer(
  instance: WooInstance,
  id: number,
  payload: Record<string, unknown>,
): Promise<WooCustomer> {
  const client = getClient(instance);
  const { data } = await client.put<WooCustomer>(`/wp-json/wc/v3/customers/${id}`, payload);
  if (data.email) await cacheDel(`woo:${instance}:customer:${data.email.toLowerCase()}`);
  return data;
}

// ─── Pedidos ───────────────────────────────────────────────────────────────

export async function getOrdersByCustomerId(
  instance: WooInstance,
  customerId: number,
): Promise<WooOrder[]> {
  const client = getClient(instance);
  const { data } = await client.get<WooOrder[]>('/wp-json/wc/v3/orders', {
    params: { customer: customerId, orderby: 'date', order: 'desc', per_page: 50 },
  });
  return Array.isArray(data) ? data : [];
}

export async function findWooOrderByShopifyId(
  instance: WooInstance,
  customerId: number,
  shopifyOrderId: string,
): Promise<WooOrder | null> {
  const orders = await getOrdersByCustomerId(instance, customerId);
  for (const order of orders) {
    const metas = Array.isArray(order.meta_data) ? order.meta_data : [];
    const hit = metas.find(
      (m) => m.key === '_shopify_order_id' && String(m.value) === shopifyOrderId,
    );
    if (hit) return order;
  }
  return null;
}

export async function createOrder(
  instance: WooInstance,
  payload: Record<string, unknown>,
): Promise<WooOrder> {
  const client = getClient(instance);
  const { data } = await client.post<WooOrder>('/wp-json/wc/v3/orders', payload);
  return data;
}

export async function updateOrder(
  instance: WooInstance,
  orderId: number,
  payload: Record<string, unknown>,
): Promise<WooOrder> {
  const client = getClient(instance);
  const { data } = await client.put<WooOrder>(`/wp-json/wc/v3/orders/${orderId}`, payload);
  return data;
}

// ─── Scheduler: listagem ───────────────────────────────────────────────────

export interface WooOrderSummary {
  id: number;
  status: string;
  date_created: string;
  date_modified: string;
  billing: { email: string; first_name: string; last_name: string };
  meta_data: { key: string; value: unknown }[];
  line_items: { sku: string; quantity: number; name: string; total: string }[];
}

export interface WooProductSummary {
  id: number;
  sku: string;
  name: string;
  type: string;
  regular_price: string;
  sale_price: string;
  stock_quantity: number | null;
  date_modified: string;
}

/** Busca os pedidos mais recentes do WooCommerce (paginados). */
export async function getRecentWooOrders(
  instance: WooInstance,
  page = 1,
  perPage = 50,
  modifiedAfter?: string,
): Promise<WooOrderSummary[]> {
  const client = getClient(instance);
  const params: Record<string, unknown> = {
    orderby: 'modified',
    order: 'desc',
    per_page: perPage,
    page,
  };
  if (modifiedAfter) params['modified_after'] = modifiedAfter;
  const { data } = await client.get<WooOrderSummary[]>('/wp-json/wc/v3/orders', { params });
  return Array.isArray(data) ? data : [];
}

/** Busca os produtos mais recentes do WooCommerce. */
export async function getRecentWooProducts(
  instance: WooInstance,
  page = 1,
  perPage = 100,
  modifiedAfter?: string,
): Promise<WooProductSummary[]> {
  const client = getClient(instance);
  const params: Record<string, unknown> = {
    orderby: 'modified',
    order: 'desc',
    per_page: perPage,
    page,
  };
  if (modifiedAfter) params['modified_after'] = modifiedAfter;
  const { data } = await client.get<WooProductSummary[]>('/wp-json/wc/v3/products', { params });
  return Array.isArray(data) ? data : [];
}
