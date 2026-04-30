// ─── Tipos que espelham os DTOs do backend ────────────────────────────────────

export type LogType = 'order' | 'customer' | 'product' | 'error';

export interface LogOrder {
  _id: string;
  timestamp: string;
  action: string;
  status: 'success' | 'error' | 'skipped';
  shopify_order_id?: string;
  shopify_order_name?: string;
  payload?: Record<string, unknown>;
  webhook?: Record<string, unknown>;
  response?: Record<string, unknown>;
}

export interface LogCustomer {
  _id: string;
  timestamp: string;
  action: string;
  status: 'success' | 'error' | 'skipped';
  email?: string;
  payload?: Record<string, unknown>;
  webhook?: Record<string, unknown>;
  response?: Record<string, unknown>;
}

export interface LogProduct {
  _id: string;
  timestamp: string;
  action: string;
  status: 'success' | 'error' | 'skipped';
  sku?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  shopify_response?: Record<string, unknown>;
}

export interface LogError {
  _id: string;
  timestamp: string;
  flow: string;
  error_message: string;
  payload?: Record<string, unknown>;
  stack?: string;
}

export type LogRow = LogOrder | LogCustomer | LogProduct | LogError;

export interface LogsResponse {
  data: LogRow[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface LogsFilters {
  type: LogType;
  page: number;
  limit: number;
  search?: string;
  status?: string;
  action?: string;
  from?: string;
  to?: string;
}
export interface LogEntitySummary {
  id: string;
  name: string;
  lastTimestamp: string;
  count: number;
  status: 'success' | 'error' | 'skipped';
}

export interface LogEntityDetail {
  entityId: string;
  name: string;
  events: LogRow[];
  errors: LogError[];
  eventsTotal: number;
  eventsPages: number;
  eventsPage: number;
  errorsTotal: number;
  errorsPages: number;
  errorsPage: number;
}

export interface LogEntitiesResponse {
  data: LogEntitySummary[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

// ─── Filas BullMQ ─────────────────────────────────────────────────────────────

export interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface QueueStatsResponse {
  orders: QueueCounts;
  products: QueueCounts;
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export type WebhookStatusValue = 'ok' | 'created' | 'deleted' | 'error';

export interface WebhookResult {
  platform: 'shopify' | 'woocommerce';
  topic: string;
  endpoint: string;
  status?: WebhookStatusValue;
  exists?: boolean;
  id?: string | number;
  registeredUrl?: string;
  error?: string;
  isCustom?: boolean;
}

export interface WebhookStatusResponse {
  domain: string;
  shopify: WebhookResult[] | { error: string };
  woocommerce: WebhookResult[] | { error: string };
}

export interface WebhookSyncResponse {
  domain: string;
  results: WebhookResult[];
  force: boolean;
}

// ─── WebSocket events ─────────────────────────────────────────────────────────

export interface WsLogEvent {
  type: LogType;
  data: Record<string, unknown>;
}

export interface WsQueueEvent {
  queue: string;
  jobName: string;
  status: 'completed' | 'failed';
}

export type WsEvent = WsLogEvent | WsQueueEvent | { type: 'error'; message: string };

// ─── Config API ───────────────────────────────────────────────────────────────

export interface DashboardConfig {
  domain: string | null;
  queueAttempts: number;
  queueBackoffMs: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
}
