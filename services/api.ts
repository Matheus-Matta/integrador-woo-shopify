import type {
  LogsFilters,
  LogsResponse,
  QueueStatsResponse,
  WebhookStatusResponse,
  WebhookSyncResponse,
  DashboardConfig,
  LogEntitiesResponse,
  LogEntityDetail,
} from '@/types';

// Como o frontend e o backend agora são o mesmo app Next.js, 
// podemos usar caminhos relativos.
const BASE = ''; 

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...options,
  });
  if (res.status === 401) {
    // Força redirect para login em caso de sessão expirada
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Não autenticado');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error((body as { error: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function login(password: string): Promise<void> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error: string }).error ?? 'Senha incorreta');
  }
}

export async function logout(): Promise<void> {
  await fetch(`${BASE}/api/auth/logout`, { credentials: 'include' });
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

export async function getLogs(filters: LogsFilters): Promise<LogsResponse> {
  const params = new URLSearchParams({
    type: filters.type,
    page: String(filters.page),
    limit: String(filters.limit),
  });
  if (filters.search)  params.set('search', filters.search);
  if (filters.status)  params.set('status', filters.status);
  if (filters.action)  params.set('action', filters.action);
  if (filters.from)    params.set('from', filters.from);
  if (filters.to)      params.set('to', filters.to);

  return apiFetch<LogsResponse>(`/api/dashboard/logs?${params}`);
}

export async function getEntityLogs(filters: LogsFilters): Promise<LogEntitiesResponse> {
  const params = new URLSearchParams({
    type: filters.type,
    page: String(filters.page),
    limit: String(filters.limit),
  });
  if (filters.search) params.set('search', filters.search);

  return apiFetch<LogEntitiesResponse>(`/api/dashboard/logs/entities?${params}`);
}

export async function getEntityDetail(
  type: string,
  id: string,
  eventsPage = 1,
  limitEvents = 20,
  errorsPage = 1,
  limitErrors = 20,
): Promise<LogEntityDetail> {
  const params = new URLSearchParams({
    type,
    id,
    pageEvents: String(eventsPage),
    limitEvents: String(limitEvents),
    pageErrors: String(errorsPage),
    limitErrors: String(limitErrors),
  });
  return apiFetch<LogEntityDetail>(`/api/dashboard/logs/entity?${params.toString()}`);
}


// ─── Filas ────────────────────────────────────────────────────────────────────

export async function getQueueStats(): Promise<QueueStatsResponse> {
  return apiFetch<QueueStatsResponse>('/api/dashboard/queue-stats');
}

export async function retryFailed(queueName: string): Promise<{ retriedCount: number }> {
  return apiFetch<{ retriedCount: number }>(`/api/dashboard/queue/${queueName}/retry-failed`, {
    method: 'POST',
  });
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export async function getWebhookStatus(): Promise<WebhookStatusResponse> {
  return apiFetch<WebhookStatusResponse>('/api/dashboard/webhooks/status');
}

export async function syncWebhooks(force = false): Promise<WebhookSyncResponse> {
  return apiFetch<WebhookSyncResponse>('/api/dashboard/webhooks/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force }),
  });
}

// ─── Config ───────────────────────────────────────────────────────────────────

export async function getDashboardConfig(): Promise<DashboardConfig> {
  return apiFetch<DashboardConfig>('/api/dashboard/config');
}
