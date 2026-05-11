/**
 * Deduplicacao de webhooks via Redis.
 *
 * Camada 1 - delivery-id: cada entrega Shopify/Woo tem um ID unico. Se a
 * plataforma retentar o mesmo webhook, o delivery-id costuma ser identico.
 *
 * Camada 2 - order-id: use apenas em fluxos que precisam ser idempotentes por
 * entidade, como orders/create. Para updates, prefira fingerprint do payload
 * para nao bloquear eventos rapidos mas diferentes, como pagamento aprovado.
 */
import { redis } from '../db/redis';

const DELIVERY_TTL = 60 * 60 * 24; // 24 h
const ORDER_TTL = 60 * 10; // fallback para fluxos que ainda deduplicam por entidade
const CREATE_ORDER_TTL = 60 * 60 * 24 * 7; // create deve ser idempotente por mais tempo

/**
 * Tenta marcar o delivery-id como processado.
 * Retorna true se e a primeira vez, false se ja foi processado antes.
 */
export async function deduplicateDelivery(deliveryId: string): Promise<boolean> {
  const key = `wh:del:${deliveryId}`;
  const result = await redis.set(key, '1', 'EX', DELIVERY_TTL, 'NX');
  return result === 'OK';
}

/**
 * Tenta marcar o par (flow, orderId) como processado dentro da janela.
 * Use apenas quando qualquer novo evento da mesma entidade deve ser ignorado.
 */
export async function deduplicateOrder(flow: string, orderId: string): Promise<boolean> {
  const key = `wh:ord:${flow}:${orderId}`;
  const ttl = flow === 'shop-order-create' ? CREATE_ORDER_TTL : ORDER_TTL;
  const result = await redis.set(key, '1', 'EX', ttl, 'NX');
  return result === 'OK';
}

export async function deduplicateFingerprint(
  flow: string,
  entityId: string,
  fingerprint: string,
  ttlSeconds = 60,
): Promise<boolean> {
  const key = `wh:fp:${flow}:${entityId}:${fingerprint}`;
  const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}
