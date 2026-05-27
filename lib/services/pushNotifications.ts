import { connectMongo, DeviceTokenModel, PushNotificationLogModel } from '@/lib/db/mongo';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// ─── Frequências disponíveis para envio recorrente ─────────────────────────

export const FREQUENCY_OPTIONS = [
  { value: 'every_1h',   label: 'A cada 1 hora',         every: 1 * 60 * 60 * 1000 },
  { value: 'every_6h',   label: 'A cada 6 horas',        every: 6 * 60 * 60 * 1000 },
  { value: 'every_12h',  label: 'A cada 12 horas',       every: 12 * 60 * 60 * 1000 },
  { value: 'daily_9h',   label: 'Diário às 9h',          pattern: '0 9 * * *'  },
  { value: 'daily_18h',  label: 'Diário às 18h',         pattern: '0 18 * * *' },
  { value: 'weekly_mon', label: 'Semanal (seg às 9h)',   pattern: '0 9 * * 1'  },
  { value: 'monthly_1',  label: 'Mensal (dia 1 às 9h)',  pattern: '0 9 1 * *'  },
] as const;

export type FrequencyValue = typeof FREQUENCY_OPTIONS[number]['value'];

export function getFrequencyRepeatOpts(value: string): { every: number } | { pattern: string } | null {
  const opt = FREQUENCY_OPTIONS.find((f) => f.value === value);
  if (!opt) return null;
  if ('every' in opt) return { every: opt.every };
  return { pattern: opt.pattern };
}

// ─── Tipos Expo Push API ───────────────────────────────────────────────────

export interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;       // presente quando status === 'ok'
  message?: string;  // presente quando status === 'error'
  details?: {
    error?: 'DeviceNotRegistered' | 'MessageTooBig' | 'MessageRateExceeded' | 'InvalidCredentials' | string;
    expoPushToken?: string;
    sentAt?: number;
    [key: string]: unknown;
  };
}

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;  // Android notification channel
}

export interface SendResult {
  sent:    number;
  failed:  number;
  errors:  { token: string; error: string }[];
  tickets: ExpoTicket[];
}

// ─── Envio para Expo Push API ──────────────────────────────────────────────

/**
 * Envia um lote de mensagens para a Expo Push API.
 * Cada mensagem é um objeto individual {to, title, body, ...} — formato
 * recomendado pela Expo para rastrear erros por token.
 *
 * Retorna os tickets em ordem correspondente às mensagens enviadas.
 */
async function sendToExpo(messages: PushMessage[]): Promise<ExpoTicket[]> {
  if (messages.length === 0) return [];

  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept':        'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '(sem corpo)');
    throw new Error(`Expo Push API HTTP ${response.status}: ${text}`);
  }

  const json = await response.json() as { data?: ExpoTicket[] };

  // Expo retorna { data: ExpoTicket[] }
  const tickets = json?.data;
  if (!Array.isArray(tickets)) {
    console.error('[Push] Resposta inesperada da Expo:', JSON.stringify(json));
    throw new Error('Resposta da Expo Push API em formato inesperado');
  }

  return tickets;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  );
}

/**
 * Processa os tickets retornados pela Expo, loga erros e remove tokens
 * inválidos do banco (DeviceNotRegistered).
 */
async function processTickets(
  tickets: ExpoTicket[],
  tokens: string[],
): Promise<{ sent: number; failed: number; errors: { token: string; error: string }[] }> {
  let sent   = 0;
  let failed = 0;
  const errors: { token: string; error: string }[] = [];
  const staleTokens: string[] = [];

  tickets.forEach((ticket, i) => {
    const token = tokens[i] ?? 'unknown';
    if (ticket.status === 'ok') {
      sent++;
    } else {
      failed++;
      const errorCode = ticket.details?.error ?? 'Unknown';
      const msg = ticket.message ?? errorCode;
      errors.push({ token, error: msg });
      console.error(`[Push] Token com erro — token=${token} error=${errorCode} message=${msg}`);

      // Marca token como inválido para remoção
      if (errorCode === 'DeviceNotRegistered') {
        staleTokens.push(token);
      }
    }
  });

  // Remove tokens inválidos em background (não bloqueia o retorno)
  if (staleTokens.length > 0) {
    DeviceTokenModel.deleteMany({ token: { $in: staleTokens } })
      .then((r) => console.warn(`[Push] ${r.deletedCount} token(s) DeviceNotRegistered removido(s)`))
      .catch((e: unknown) => console.error('[Push] Erro ao remover tokens expirados:', e));
  }

  return { sent, failed, errors };
}

// ─── Envio para usuário específico ─────────────────────────────────────────

export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  sentBy = 'dashboard',
): Promise<{ sent: boolean; result?: ExpoTicket[]; error?: string }> {
  await connectMongo();
  const device = await DeviceTokenModel.findOne({ userId });
  if (!device) return { sent: false, error: 'Token não encontrado para este usuário' };

  const token = device.token as string;
  console.log(`[Push] Enviando para userId=${userId} token=${token}`);

  const message: PushMessage = { to: token, title, body, sound: 'default', ...(data ? { data } : {}) };

  let tickets: ExpoTicket[] = [];
  try {
    tickets = await sendToExpo([message]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Push] Falha HTTP ao enviar para ${token}:`, msg);
    return { sent: false, error: msg };
  }

  const { sent, errors } = await processTickets(tickets, [token]);
  await PushNotificationLogModel.create({ to: token, title, body, data, result: tickets, sentBy });

  if (sent === 0 && errors.length > 0) {
    return { sent: false, result: tickets, error: errors[0].error };
  }
  return { sent: true, result: tickets };
}

// ─── Broadcast para todos os dispositivos ──────────────────────────────────

export async function broadcastPush(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  sentBy = 'broadcast',
): Promise<SendResult & { error?: string }> {
  await connectMongo();
  const devices = await DeviceTokenModel.find({}, 'token');
  if (devices.length === 0) return { sent: 0, failed: 0, errors: [], tickets: [], error: 'Nenhum token registrado' };

  const tokens = devices.map((d) => d.token as string);
  console.log(`[Push] Broadcast para ${tokens.length} dispositivo(s)`);

  // Envia em lotes de 100 (limite da Expo por request)
  const chunks  = chunkArray(tokens, 100);
  const allTickets: ExpoTicket[] = [];

  for (const chunk of chunks) {
    const messages: PushMessage[] = chunk.map((token) => ({
      to: token, title, body, sound: 'default', ...(data ? { data } : {}),
    }));
    try {
      const tickets = await sendToExpo(messages);
      allTickets.push(...tickets);
    } catch (err) {
      console.error('[Push] Falha HTTP ao enviar lote:', err);
      // Continua com os outros lotes
    }
  }

  const { sent, failed, errors } = await processTickets(allTickets, tokens);
  console.log(`[Push] Broadcast concluído — sent=${sent} failed=${failed}`);
  if (errors.length) console.error('[Push] Erros de entrega:', JSON.stringify(errors));

  await PushNotificationLogModel.create({ to: tokens, title, body, data, result: allTickets, sentBy });
  return { sent, failed, errors, tickets: allTickets };
}
