import { createHmac, timingSafeEqual } from 'crypto';
import { FastifyRequest } from 'fastify';
import { config } from '../config';

/**
 * Valida assinatura HMAC do Shopify.
 * Retorna true também quando SKIP_HMAC=true (testes locais).
 */
export function verifyShopifyHmac(rawBody: Buffer, signature: string): boolean {
  if (config.skipHmac) return true;
  if (!signature) return false;
  const digest = createHmac('sha256', config.shopify.webhookSecret)
    .update(rawBody)
    .digest('base64');
  const match = (() => { try { return timingSafeEqual(Buffer.from(digest), Buffer.from(signature)); } catch { return false; } })();
  if (!match) {
    console.error('[HMAC-DEBUG] shopify', {
      rawBodyLen: rawBody.length,
      rawBodyEmpty: rawBody.length === 0,
      secretLen: config.shopify.webhookSecret.length,
      computed: digest,
      received: signature,
    });
  }
  return match;
}

/**
 * Valida assinatura HMAC do WooCommerce.
 * Retorna true também quando SKIP_HMAC=true (testes locais).
 */
export function verifyWooHmac(rawBody: Buffer, signature: string): boolean {
  if (config.skipHmac) return true;
  if (!signature) return false;
  const digest = createHmac('sha256', config.woo.webhookSecret)
    .update(rawBody)
    .digest('base64');
  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Extrai o raw body do request para validação HMAC.
 * O buffer é salvo em request.rawBody pelo plugin de content-type.
 */
export function getRawBody(request: FastifyRequest): Buffer {
  // Fastify armazena o body original quando usamos addContentTypeParser com parseAs: 'buffer'
  return (request as FastifyRequest & { rawBody: Buffer }).rawBody ?? Buffer.alloc(0);
}
