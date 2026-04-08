/**
 * Deduplicação de webhooks via Redis.
 *
 * Camada 1 — delivery-id: cada entrega Shopify tem um UUID único em
 *   x-shopify-delivery-id. Se o Shopify retentar o mesmo webhook (falha de
 *   rede, timeout, etc.) o delivery-id é idêntico → descartamos.
 *
 * Camada 2 — order-id: boleto e outros métodos assíncronos disparam
 *   orders/create + orders/paid em rápida sucessão com IDs de entrega
 *   diferentes, mas mesmos dados de negócio. Usamos uma chave composta
 *   flow:shopify_order_id com TTL curto (30 s) para descartar o segundo
 *   evento dentro da janela de criação do job.
 */
import { redis } from '../db/redis';

const DELIVERY_TTL = 60 * 60 * 24; // 24 h — cobre qualquer retry da Shopify
const ORDER_TTL    = 30;            // 30 s — janela boleto create+paid

/**
 * Tenta marcar o delivery-id como processado.
 * Retorna `true` se é a primeira vez (pode processar).
 * Retorna `false` se já foi processado antes (duplicado).
 */
export async function deduplicateDelivery(deliveryId: string): Promise<boolean> {
  const key = `wh:del:${deliveryId}`;
  // SET NX EX — atômico: só insere se não existir
  const result = await redis.set(key, '1', 'EX', DELIVERY_TTL, 'NX');
  return result === 'OK';
}

/**
 * Tenta marcar o par (flow, orderId) como processado dentro da janela curta.
 * Usado para evitar duplicação boleto orders/create + orders/paid.
 * Retorna `true` se é a primeira vez (pode processar).
 * Retorna `false` se já existe (duplicado dentro da janela).
 */
export async function deduplicateOrder(flow: string, orderId: string): Promise<boolean> {
  const key = `wh:ord:${flow}:${orderId}`;
  const result = await redis.set(key, '1', 'EX', ORDER_TTL, 'NX');
  return result === 'OK';
}
