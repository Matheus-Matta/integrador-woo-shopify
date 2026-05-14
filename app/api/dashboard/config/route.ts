import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAuth } from '@/lib/auth/dashboard';
import { config, updateDynamicConfig, SystemDynamicConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

const SECRET_PLACEHOLDER = '********';

function maskSecret(value: string): string {
  return value ? SECRET_PLACEHOLDER : '';
}

function keepSecret(value: unknown): value is string {
  return typeof value === 'string' && value !== SECRET_PLACEHOLDER;
}

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth(req);
  if (auth) return auth;

  return NextResponse.json({
    shopify: {
      url: config.shopify.url || '',
      accessToken: maskSecret(config.shopify.accessToken || ''),
      webhookSecret: maskSecret(config.shopify.webhookSecret || ''),
    },
    woo: {
      url: config.woo.url || '',
      key: maskSecret(config.woo.key || ''),
      secret: maskSecret(config.woo.secret || ''),
      webhookSecret: maskSecret(config.woo.webhookSecret || ''),
    },
    lexos: {
      url: config.lexos.url || '',
      webhookToken: maskSecret(config.lexos.webhookToken || ''),
      apiToken: maskSecret(config.lexos.apiToken || ''),
      integrationKey: maskSecret(config.lexos.integrationKey || ''),
    },
    domain: config.domain || null,
    queueAttempts: config.queue.attempts,
    queueBackoffMs: config.queue.backoffDelay,
    rateLimitMax: config.rateLimit.max,
    rateLimitWindowMs: config.rateLimit.windowMs,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireDashboardAuth(request);
  if (auth) return auth;

  try {
    const body = await request.json();

    const newConfig: Partial<SystemDynamicConfig> = {};
    if (body.shopify) {
      newConfig.shopify = {
        url: typeof body.shopify.url === 'string' ? body.shopify.url : config.shopify.url,
        accessToken: keepSecret(body.shopify.accessToken) ? body.shopify.accessToken : config.shopify.accessToken,
        webhookSecret: keepSecret(body.shopify.webhookSecret) ? body.shopify.webhookSecret : config.shopify.webhookSecret,
      };
    }
    if (body.woo) {
      newConfig.woo = {
        url: typeof body.woo.url === 'string' ? body.woo.url : config.woo.url,
        key: keepSecret(body.woo.key) ? body.woo.key : config.woo.key,
        secret: keepSecret(body.woo.secret) ? body.woo.secret : config.woo.secret,
        webhookSecret: keepSecret(body.woo.webhookSecret) ? body.woo.webhookSecret : config.woo.webhookSecret,
      };
    }
    if (body.lexos) {
      newConfig.lexos = {
        url: typeof body.lexos.url === 'string' ? body.lexos.url : config.lexos.url,
        webhookToken: keepSecret(body.lexos.webhookToken) ? body.lexos.webhookToken : config.lexos.webhookToken,
        apiToken: keepSecret(body.lexos.apiToken) ? body.lexos.apiToken : config.lexos.apiToken,
        integrationKey: keepSecret(body.lexos.integrationKey) ? body.lexos.integrationKey : config.lexos.integrationKey,
      };
    }
    if (body.domain !== undefined) newConfig.domain = body.domain;

    updateDynamicConfig(newConfig);

    return NextResponse.json({ success: true, message: 'Configuração atualizada com sucesso' });
  } catch (err) {
    console.error('[Config API] Erro ao atualizar configurações', err);
    return NextResponse.json({ success: false, message: 'Erro interno ao processar requisição' }, { status: 500 });
  }
}
