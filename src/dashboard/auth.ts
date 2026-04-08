/**
 * Dashboard — autenticação JWT + middleware de proteção
 */
import crypto from 'crypto';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config';
import { denyJwt, isJwtDenied } from '../services/jwtDenylist';

interface JwtPayload {
  sub: string;
  jti?: string;
  iat?: number;
  exp?: number;
}

/** Protege rotas: verifica cookie 'dash_token' ou header Authorization Bearer */
export async function dashboardAuthHook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Rota de login e assets estáticos são livres
  if (
    request.routeOptions.url === '/dashboard/login' ||
    request.routeOptions.url === '/dashboard/logout' ||
    (request.routeOptions.url ?? '').startsWith('/dashboard/static')
  ) {
    return;
  }

  try {
    const token =
      (request.cookies as Record<string, string | undefined>)?.['dash_token'] ??
      (request.headers.authorization?.replace('Bearer ', '') ?? '');

    if (!token) throw new Error('sem token');
    const decoded = await (request.server as FastifyInstance).jwt.verify<JwtPayload>(token);

    // Checar denylist (tokens revogados no logout)
    if (decoded.jti && await isJwtDenied(decoded.jti)) {
      throw new Error('token revogado');
    }
  } catch {
    if (request.headers.accept?.includes('application/json')) {
      return reply.status(401).send({ error: 'Não autenticado' });
    }
    return reply.redirect('/dashboard/login');
  }
}

/** Rotas de login / logout */
export async function dashboardAuthRoutes(app: FastifyInstance): Promise<void> {
  // GET /dashboard/login — página de login
  app.get('/dashboard/login', async (_request, reply) => {
    return reply.sendFile('login.html');
  });

  // POST /dashboard/login — valida senha e emite JWT
  // Rate limit: 10 tentativas por 15 min por IP (anti-brute-force)
  app.post<{ Body: { password?: string } }>(
    '/dashboard/login',
    {
      config: { rateLimit: { max: 10, timeWindow: 15 * 60 * 1000 } },
    },
    async (request, reply) => {
      const { password } = request.body ?? {};
      if (!password || password !== config.dashboard.password) {
        return reply.status(401).send({ error: 'Senha incorreta' });
      }

      const jti = crypto.randomUUID();
      const token = app.jwt.sign(
        { sub: 'dashboard', jti },
        { expiresIn: '8h' },
      );

      void reply.setCookie('dash_token', token, {
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        maxAge: 8 * 60 * 60,
      });

      return reply.send({ ok: true });
    },
  );

  // GET /dashboard/logout — revoga token na denylist, limpa cookie e redireciona
  app.get('/dashboard/logout', async (request, reply) => {
    try {
      const token =
        (request.cookies as Record<string, string | undefined>)?.['dash_token'] ?? '';
      if (token) {
        const decoded = app.jwt.decode<JwtPayload>(token);
        if (decoded?.jti && decoded?.exp) {
          const ttlSeconds = decoded.exp - Math.floor(Date.now() / 1000);
          await denyJwt(decoded.jti, ttlSeconds);
        }
      }
    } catch { /* ignora erro de decode — cookie pode estar corrompido */ }

    void reply.clearCookie('dash_token', { path: '/' });
    return reply.redirect('/dashboard/login');
  });
}

