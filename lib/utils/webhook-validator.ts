import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../config';

/**
 * Valida assinatura HMAC do Shopify.
 * Retorna true também quando SKIP_HMAC=true (testes locais).
 */
export function verifyShopifyHmac(rawBody: Buffer | string, signature: string): boolean {
  if (config.skipHmac) return true;
  if (!signature) return false;
  const digest = createHmac('sha256', config.shopify.webhookSecret)
    .update(rawBody as any, typeof rawBody === 'string' ? 'utf8' : undefined)
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

