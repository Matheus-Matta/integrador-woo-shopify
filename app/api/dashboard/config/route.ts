import { NextResponse } from 'next/server';
import { config, updateDynamicConfig, SystemDynamicConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    shopify: {
      url: config.shopify.url || '',
      accessToken: config.shopify.accessToken || '',
      webhookSecret: config.shopify.webhookSecret || '',
    },
    woo: {
      url: config.woo.url || '',
      key: config.woo.key || '',
      secret: config.woo.secret || '',
      webhookSecret: config.woo.webhookSecret || '',
    },
    domain: config.domain || null,
    queueAttempts: config.queue.attempts,
    queueBackoffMs: config.queue.backoffDelay,
    rateLimitMax: config.rateLimit.max,
    rateLimitWindowMs: config.rateLimit.windowMs,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const newConfig: Partial<SystemDynamicConfig> = {};
    if (body.shopify) newConfig.shopify = body.shopify;
    if (body.woo) newConfig.woo = body.woo;
    if (body.domain !== undefined) newConfig.domain = body.domain;

    updateDynamicConfig(newConfig);

    return NextResponse.json({ success: true, message: 'Configuração atualizada com sucesso' });
  } catch (err) {
    console.error('[Config API] Erro ao atualizar configurações', err);
    return NextResponse.json({ success: false, message: 'Erro interno ao processar requisição' }, { status: 500 });
  }
}
