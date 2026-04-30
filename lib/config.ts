import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function require_env(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Variável de ambiente obrigatória não definida: ${key}`);
  return val;
}

function ensure_url(url: string | undefined, fallback: string): URL {
  if (!url) return new URL(fallback);
  const normalized = url.includes('://') ? url : `https://${url}`;
  try {
    return new URL(normalized);
  } catch {
    return new URL(fallback);
  }
}

// ─── Crypto Utilities ───

const ALGORITHM = 'aes-256-cbc';

function getEncryptionKey(): Buffer {
  const secret = process.env.DASHBOARD_JWT_SECRET || 'fallback_secret_integrador_woo_shopify';
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encrypt(text: string): string {
  if (!text) return text;
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (err) {
    console.error('[Config] Error encrypting string');
    return text;
  }
}

function decrypt(text: string): string {
  if (!text || !text.includes(':')) return text;
  try {
    const [ivHex, encryptedHex] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[Config] Error decrypting string');
    return text;
  }
}

// ─── Dynamic Config Management ───

export interface SystemDynamicConfig {
  shopify: {
    url: string;
    accessToken: string;
    webhookSecret: string;
  };
  woo: {
    url: string;
    key: string;
    secret: string;
    webhookSecret: string;
  };
  domain: string;
  scheduler: {
    active: boolean;
    intervalMs: number;
    lookbackHours: number;
  };
}

const CONFIG_PATH = path.join(process.cwd(), 'config.json');

let dynamicConfig: SystemDynamicConfig;

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const rawConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      dynamicConfig = {
        shopify: {
          url: rawConfig.shopify?.url || '',
          accessToken: decrypt(rawConfig.shopify?.accessToken || ''),
          webhookSecret: decrypt(rawConfig.shopify?.webhookSecret || ''),
        },
        woo: {
          url: rawConfig.woo?.url || '',
          key: decrypt(rawConfig.woo?.key || ''),
          secret: decrypt(rawConfig.woo?.secret || ''),
          webhookSecret: decrypt(rawConfig.woo?.webhookSecret || ''),
        },
        domain: rawConfig.domain || '',
        scheduler: {
          active: rawConfig.scheduler?.active ?? true,
          intervalMs: rawConfig.scheduler?.intervalMs ?? 30 * 60 * 1000,
          lookbackHours: rawConfig.scheduler?.lookbackHours ?? 2,
        },
      };
    } catch (err) {
      console.error('[Config] Erro ao ler config.json. Usando env padrão.', err);
      initFromEnv();
    }
  } else {
    initFromEnv();
  }
}

function initFromEnv() {
  dynamicConfig = {
    shopify: {
      url: process.env.SHOPIFY_URL || '',
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN || '',
      webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET || '',
    },
    woo: {
      url: process.env.WOO_URL || '',
      key: process.env.WOO_KEY || '',
      secret: process.env.WOO_SECRET || '',
      webhookSecret: process.env.WOO_WEBHOOK_SECRET || '',
    },
    domain: process.env.DOMAIN || '',
    scheduler: {
      active: process.env.SCHEDULER_ACTIVE !== 'false',
      intervalMs: Number(process.env.SCHEDULER_INTERVAL_MS ?? 30 * 60 * 1000),
      lookbackHours: Number(process.env.SCHEDULER_LOOKBACK_HOURS ?? 2),
    },
  };
  saveConfig();
}

function saveConfig() {
  try {
    const encryptedConfig = {
      shopify: {
        url: dynamicConfig.shopify.url,
        accessToken: encrypt(dynamicConfig.shopify.accessToken),
        webhookSecret: encrypt(dynamicConfig.shopify.webhookSecret),
      },
      woo: {
        url: dynamicConfig.woo.url,
        key: encrypt(dynamicConfig.woo.key),
        secret: encrypt(dynamicConfig.woo.secret),
        webhookSecret: encrypt(dynamicConfig.woo.webhookSecret),
      },
      domain: dynamicConfig.domain,
      scheduler: dynamicConfig.scheduler,
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(encryptedConfig, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Config] Erro ao salvar config.json', err);
  }
}

export function updateDynamicConfig(newConfig: Partial<SystemDynamicConfig>) {
  dynamicConfig = {
    ...dynamicConfig,
    ...newConfig,
    shopify: { ...dynamicConfig.shopify, ...(newConfig.shopify || {}) },
    woo: { ...dynamicConfig.woo, ...(newConfig.woo || {}) },
    scheduler: { ...dynamicConfig.scheduler, ...(newConfig.scheduler || {}) },
  };
  saveConfig();
}

// Inicializa a configuração no load do módulo
loadConfig();

// ─── System Config Export ───

export const config = {
  port: Number(process.env.PORT ?? 3000),

  get shopify() { return dynamicConfig.shopify; },
  get woo() { return dynamicConfig.woo; },
  get domain() { return dynamicConfig.domain.replace(/\/$/, ''); },
  get scheduler() { return dynamicConfig.scheduler; },

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD || undefined,
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

  queue: {
    attempts: Number(process.env.QUEUE_ATTEMPTS ?? 3),
    backoffDelay: Number(process.env.QUEUE_BACKOFF_DELAY_MS ?? 5_000),
  },

  skipHmac: process.env.SKIP_HMAC === 'true',

  get rateLimit() {
    return {
      max: Number(process.env.RATE_LIMIT_MAX ?? 60),
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
      get trustedHosts() {
        return [
          ensure_url(dynamicConfig.shopify.url, 'https://shopify.com').hostname,
          ensure_url(dynamicConfig.woo.url,    'https://woocommerce.com').hostname,
          ensure_url(dynamicConfig.domain,     'https://localhost').hostname,
        ].filter(Boolean);
      }
    };
  },
} as const;
