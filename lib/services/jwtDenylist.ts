/**
 * Denylist de JWTs revogados — armazenada no Redis com TTL automático.
 * Usada para invalidar tokens no logout antes do prazo de expiração.
 */
import { redis } from '../db/redis';

const PREFIX = 'jwt:deny:';

/**
 * Adiciona um JTI à denylist.
 * @param jti   - Identificador único do token (claim "jti")
 * @param ttlSeconds - Tempo restante até o token expirar (segundos)
 */
export async function denyJwt(jti: string, ttlSeconds: number): Promise<void> {
  if (ttlSeconds <= 0) return;
  await redis.set(`${PREFIX}${jti}`, '1', 'EX', ttlSeconds);
}

/**
 * Verifica se um JTI está na denylist (token revogado).
 */
export async function isJwtDenied(jti: string): Promise<boolean> {
  const val = await redis.get(`${PREFIX}${jti}`);
  return val !== null;
}
