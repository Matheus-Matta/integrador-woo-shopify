import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import path from 'path';
import helmet from '@fastify/helmet';
import formbody from '@fastify/formbody';
import fastifyWebsocket from '@fastify/websocket';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import { config } from './config';
import { verifyShopifyHmac, verifyWooHmac } from './utils/webhook-validator';

// Rotas webhook
import { wooProductRoute } from './routes/woo-product';
import { shopCustomerCreateRoute } from './routes/shop-customer-create';
import { shopCustomerUpdateRoute } from './routes/shop-customer-update';
import { shopOrderCreateRoute } from './routes/shop-order-create';
import { shopOrderUpdateRoute } from './routes/shop-order-update';
import { wooOrderUpdateRoute } from './routes/woo-order-update';

// Dashboard
import { dashboardAuthHook, dashboardAuthRoutes } from './dashboard/auth';
import { dashboardApiRoutes } from './dashboard/api';
import { dashboardWsRoutes } from './dashboard/ws';
import { dashboardWebhookRoutes } from './dashboard/webhooks';

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // ── Capture raw body para validação HMAC ────────────────────────────────
  // Regex para aceitar application/json com ou sem ;charset=UTF-8
  app.addContentTypeParser(
    /^application\/json/,
    { parseAs: 'buffer' },
    (req, body, done) => {
      try {
        (req as FastifyRequest & { rawBody: Buffer }).rawBody = body as Buffer;
        const parsed = JSON.parse((body as Buffer).toString('utf8'));
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  await app.register(formbody);

  // ── Rate limiting — isenta domínios confiáveis (Shopify, WooCommerce, DOMAIN) ──
  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowMs,
    allowList(request: FastifyRequest) {
      // Isenta domínios confiáveis (Shopify, WooCommerce, DOMAIN)
      const headers = request.headers;
      const candidates = [
        headers['origin'] as string | undefined,
        headers['referer'] as string | undefined,
        headers['x-shopify-shop-domain'] as string | undefined,
        // WooCommerce envia o URL de origem neste header
        headers['x-wc-webhook-source'] as string | undefined,
      ];
      for (const raw of candidates) {
        if (!raw) continue;
        try {
          const host = new URL(raw.startsWith('http') ? raw : `https://${raw}`).hostname;
          if (config.rateLimit.trustedHosts.includes(host)) return true;
        } catch { /* url inválida, ignora */ }
      }
      return false;
    },
    errorResponseBuilder() {
      return { statusCode: 429, error: 'Too Many Requests', message: 'Muitas requisições. Tente novamente em instantes.' };
    },
  });

  // ── Security headers ─────────────────────────────────────────────────────
  // CSP desabilitado: o dashboard usa scripts via CDN externo (Tailwind, Alpine)
  await app.register(helmet, { contentSecurityPolicy: false });

  await app.register(fastifyWebsocket);
  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: config.dashboard.jwtSecret,
    sign:   { algorithm: 'HS256' },
    verify: { algorithms: ['HS256'] },
  });

  // Serve ficheiros estáticos do dashboard (serve:false = apenas habilita sendFile)
  await app.register(fastifyStatic, {
    root: path.join(__dirname, 'dashboard'),
    serve: false,
  });

  // ── Handler global de erros não tratados ─────────────────────────────────
  app.setErrorHandler(async (error: Error & { statusCode?: number }, request, reply) => {
    const status = error.statusCode ?? 500;
    request.log.error({ err: error, url: request.url, method: request.method, status }, `[erro] ${error.message}`);
    // Em produção, não vazar mensagem interna em erros 5xx
    const message =
      status >= 500 && process.env.NODE_ENV === 'production'
        ? 'Erro interno do servidor'
        : (error.message ?? 'Erro interno do servidor');
    return reply.status(status).send({ error: message, statusCode: status });
  });

  // ── Health check ─────────────────────────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

  // ── Redirect raiz → dashboard ─────────────────────────────────────────────
  app.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.redirect('/dashboard');
  });

  // ── 404 global → redireciona para dashboard ───────────────────────────────
  app.setNotFoundHandler(async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.redirect('/dashboard');
  });

  // ── Rotas webhook ─────────────────────────────────────────────────────────
  await app.register(wooProductRoute);
  await app.register(shopCustomerCreateRoute);
  await app.register(shopCustomerUpdateRoute);
  await app.register(shopOrderCreateRoute);
  await app.register(shopOrderUpdateRoute);
  await app.register(wooOrderUpdateRoute);

  // ── Dashboard (scope isolado com preHandler de autenticação) ──────────────
  await app.register(async (dash) => {
    dash.addHook('preHandler', dashboardAuthHook);

    // Rotas de auth (login/logout)
    await dash.register(dashboardAuthRoutes);

    // API REST
    await dash.register(dashboardApiRoutes);

    // Webhooks sync
    await dash.register(dashboardWebhookRoutes);

    // WebSocket
    await dash.register(dashboardWsRoutes);

    // Página principal
    dash.get('/dashboard', async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.type('text/html').sendFile('index.html');
    });
  });

  return app;
}

