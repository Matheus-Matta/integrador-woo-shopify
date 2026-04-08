import Redis from 'ioredis';
import { config } from '../config';

export const redis = new Redis(config.redis.url, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
});

redis.on('error', (err) => console.error('[Redis] Erro:', err.message));
redis.on('connect', () => console.log('[Redis] Conexão estabelecida:', config.redis.url));

export async function connectRedis(): Promise<void> {
  await redis.connect();
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const ttl = ttlSeconds ?? config.redis.ttl;
  await redis.set(key, JSON.stringify(value), 'EX', ttl);
}

export async function cacheDel(key: string): Promise<void> {
  await redis.del(key);
}
