/**
 * Dashboard — WebSocket para eventos em tempo real
 * Endpoint: GET /dashboard/ws
 * Autenticação: cookie httpOnly 'dash_token' (não exposto em query string / logs)
 */
import { FastifyInstance } from 'fastify';
import { logEmitter, LogEvent, QueueEvent } from '../services/emitter';
import { isJwtDenied } from '../services/jwtDenylist';
import { config } from '../config';

interface JwtPayload { sub: string; jti?: string; exp?: number; }

/** Remove campos com dados sensíveis antes de enviar ao cliente */
function sanitize(event: LogEvent | QueueEvent): Record<string, unknown> {
  const ev = { ...(event as unknown as Record<string, unknown>) };
  // Para LogEvents, limpar o campo data de campos sensíveis
  if (typeof ev['data'] === 'object' && ev['data'] !== null) {
    const data = { ...(ev['data'] as Record<string, unknown>) };
    delete data['payload'];
    delete data['response'];
    delete data['shopify_response'];
    delete data['stack'];
    ev['data'] = data;
  }
  return ev;
}

export async function dashboardWsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/dashboard/ws',
    { websocket: true },
    async (socket, request) => {
      // ── Validação de Origin (previne CSWSH) ───────────────────────────────
      const origin = (request.headers as Record<string, string | undefined>)['origin'];
      if (origin && config.domain) {
        try {
          const allowedHost = new URL(
            config.domain.startsWith('http') ? config.domain : `https://${config.domain}`,
          ).hostname;
          const reqHost = new URL(
            origin.startsWith('http') ? origin : `https://${origin}`,
          ).hostname;
          if (reqHost !== allowedHost && reqHost !== 'localhost' && reqHost !== '127.0.0.1') {
            socket.close(4003, 'Origin not allowed');
            return;
          }
        } catch {
          socket.close(4003, 'Origin invalid');
          return;
        }
      }

      // ── Autenticação via cookie httpOnly (sem token em query string) ───────
      const token = (request.cookies as Record<string, string | undefined>)?.['dash_token'] ?? '';
      if (!token) {
        socket.send(JSON.stringify({ type: 'error', message: 'Não autenticado' }));
        socket.close(4001, 'Unauthorized');
        return;
      }

      let decoded: JwtPayload;
      try {
        decoded = app.jwt.verify<JwtPayload>(token);
      } catch {
        socket.send(JSON.stringify({ type: 'error', message: 'Token inválido' }));
        socket.close(4001, 'Unauthorized');
        return;
      }

      // Checar denylist (tokens revogados no logout)
      if (decoded.jti && await isJwtDenied(decoded.jti)) {
        socket.send(JSON.stringify({ type: 'error', message: 'Token revogado' }));
        socket.close(4001, 'Unauthorized');
        return;
      }

      // ── Rejeitar mensagens do cliente (dashboard é somente leitura) ────────
      socket.on('message', (msg: Buffer) => {
        if (msg.length > 512) {
          socket.close(4008, 'Message too large');
        }
        // Ignora qualquer mensagem — o cliente não envia comandos
      });

      // ── Encaminhar eventos sanitizados via logEmitter ──────────────────────
      function onLog(event: LogEvent | QueueEvent) {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(sanitize(event)));
        }
      }

      logEmitter.on('log', onLog);
      logEmitter.on('queue', onLog);

      // ── Ping a cada 30s para manter a conexão viva ─────────────────────────
      const pingInterval = setInterval(() => {
        if (socket.readyState === socket.OPEN) socket.ping();
      }, 30_000);

      function cleanup() {
        clearInterval(pingInterval);
        logEmitter.off('log', onLog);
        logEmitter.off('queue', onLog);
      }

      socket.on('close', cleanup);
      socket.on('error', cleanup);
    },
  );
}

