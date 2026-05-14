import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../config';

/**
 * Valida assinatura HMAC do Shopify.
 * Retorna true também quando SKIP_HMAC=true (testes locais).
 */
export function verifyShopifyHmac(rawBody: Buffer | string, signature: string): boolean {
  if (config.skipHmac) {
    console.warn('[HMAC] SKIP_HMAC ativo — validação ignorada');
    return true;
  }
  if (!signature) {
    console.warn('[HMAC] Shopify: signature ausente');
    return false;
  }
  const secret = config.shopify.webhookSecret;
  if (!secret) {
    console.error('[HMAC] Shopify: webhookSecret não configurado — rejeitando');
    return false;
  }
  const digest = createHmac('sha256', secret)
    .update(rawBody as any, typeof rawBody === 'string' ? ('utf8' as BufferEncoding) : 'utf8')
    .digest('base64');
  try {
    const match = timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
    if (!match) {
      console.error('[HMAC] Shopify FALHOU', {
        rawBodyLen: typeof rawBody === 'string' ? rawBody.length : rawBody.byteLength,
        secretLen: secret.length,
        secretPrefix: secret.slice(0, 6) + '...',
        receivedSig: signature.slice(0, 12) + '...',
        computedSig: digest.slice(0, 12) + '...',
      });
    }
    return match;
  } catch {
    return false;
  }
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

