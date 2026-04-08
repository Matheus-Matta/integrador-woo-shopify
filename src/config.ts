import 'dotenv/config';

function require_env(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Variável de ambiente obrigatória não definida: ${key}`);
  return val;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),

  shopify: {
    url: require_env('SHOPIFY_URL'),
    accessToken: require_env('SHOPIFY_ACCESS_TOKEN'),
    webhookSecret: require_env('SHOPIFY_WEBHOOK_SECRET'),
  },

  woo: {
    url: require_env('WOO_URL'),
    key: require_env('WOO_KEY'),
    secret: require_env('WOO_SECRET'),
    webhookSecret: require_env('WOO_WEBHOOK_SECRET'),
  },

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
    ttl: Number(process.env.REDIS_CACHE_TTL_SECONDS ?? 300),
  },

  mongodb: {
    url: process.env.MONGODB_URL ?? 'mongodb://localhost:27017/integrador',
  },

  logLevel: process.env.LOG_LEVEL ?? 'info',

  dashboard: {
    password: require_env('DASHBOARD_PASSWORD'),
    jwtSecret: require_env('DASHBOARD_JWT_SECRET'),
  },

  /** Domínio público do integrador — usado para registrar webhooks */
  domain: (process.env.DOMAIN ?? '').replace(/\/$/, ''),

  queue: {
    attempts: Number(process.env.QUEUE_ATTEMPTS ?? 3),
    backoffDelay: Number(process.env.QUEUE_BACKOFF_DELAY_MS ?? 5_000),
  },

  /** true = pula validação HMAC (apenas para testes locais) */
  skipHmac: process.env.SKIP_HMAC === 'true',

  rateLimit: {
    max: Number(process.env.RATE_LIMIT_MAX ?? 60),
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    /** Hostnames confiáveis que ficam isentos do rate limit */
    trustedHosts: [
      new URL(process.env.SHOPIFY_URL ?? 'https://shopify.com').hostname,
      new URL(process.env.WOO_URL    ?? 'https://woocommerce.com').hostname,
      new URL((process.env.DOMAIN    ?? 'https://localhost').replace(/\/$/, '') || 'https://localhost').hostname,
    ].filter(Boolean),
  },
} as const;
