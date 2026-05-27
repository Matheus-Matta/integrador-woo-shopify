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

// ─── Tipos ─────────────────────────────────────────────────────────────────

export interface PushMessage {
  to: string | string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
}

// ─── Envio para Expo Push API ──────────────────────────────────────────────

export async function sendPushNotification(message: PushMessage): Promise<unknown> {
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(message),
  });
  return response.json();
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  );
}

export async function sendPushToMany(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<unknown[]> {
  const chunks = chunkArray(tokens, 100);
  const results = await Promise.all(
    chunks.map((chunk) =>
      sendPushNotification({ to: chunk, title, body, data, sound: 'default' })
    )
  );
  return results.flat() as unknown[];
}

// ─── Envio para usuário específico ─────────────────────────────────────────

export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  sentBy = 'dashboard'
): Promise<{ sent: boolean; result?: unknown; error?: string }> {
  await connectMongo();
  const device = await DeviceTokenModel.findOne({ userId });
  if (!device) return { sent: false, error: 'Token não encontrado para este usuário' };

  const result = await sendPushNotification({
    to: device.token as string,
    title,
    body,
    data,
    sound: 'default',
  });

  await PushNotificationLogModel.create({ to: device.token, title, body, data, result, sentBy });
  return { sent: true, result };
}

// ─── Broadcast para todos os dispositivos ──────────────────────────────────

export async function broadcastPush(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  sentBy = 'broadcast'
): Promise<{ sent: number; result?: unknown; error?: string }> {
  await connectMongo();
  const devices = await DeviceTokenModel.find({}, 'token');
  if (devices.length === 0) return { sent: 0, error: 'Nenhum token registrado' };

  const tokens = devices.map((d) => d.token as string);
  const result = await sendPushToMany(tokens, title, body, data);

  await PushNotificationLogModel.create({ to: tokens, title, body, data, result, sentBy });
  return { sent: tokens.length, result };
}
