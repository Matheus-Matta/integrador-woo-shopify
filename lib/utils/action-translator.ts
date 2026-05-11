export const ACTION_MAP: Record<string, string> = {
  // Orders & Customers (Shopify -> Woo)
  'create': 'Webhook Shopify -> Criou no WooCommerce',
  'update': 'Webhook Shopify -> Atualizou no WooCommerce',
  'create_skipped_duplicate': 'Webhook Shopify -> Ignorado: Duplicado',
  'update_skipped_not_found': 'Webhook Shopify -> Ignorado: Nao Encontrado no Woo',
  'webhook_received': 'Webhook Shopify -> Recebido',
  'webhook_rejected_hmac': 'Webhook -> Ignorado: HMAC invalido',
  'webhook_rejected_missing_fields': 'Webhook -> Ignorado: campos obrigatorios ausentes',
  'webhook_skipped_duplicate_delivery': 'Webhook -> Ignorado: entrega duplicada',
  'webhook_skipped_duplicate_payload': 'Webhook Shopify -> Ignorado: payload repetido',
  'webhook_skipped_duplicate_order_window': 'Webhook Shopify -> Ignorado: pedido repetido na janela de dedupe',

  // Orders (Woo -> Shopify)
  'mark_paid': 'Webhook Woo -> Marcou Pago no Shopify',
  'create_fulfillment': 'Webhook Woo -> Criou Entrega no Shopify',
  'mark_delivered': 'Webhook Woo -> Marcou Entregue no Shopify',
  'update_skipped_not_completed': 'Webhook Woo -> Ignorado: Nao Concluido',

  // Products (Woo -> Shopify)
  'sku_not_found': 'Webhook Woo -> Ignorado: SKU nao encontrado no Shopify',
  'sku_not_found_after_refresh': 'Webhook Woo -> Erro: SKU nao encontrado apos refresh',
  'title_update': 'Webhook Woo -> Atualizou Titulo no Shopify',
  'stock_update': 'Webhook Woo -> Atualizou Estoque no Shopify',
  'price_update': 'Webhook Woo -> Atualizou Preco no Shopify',
};

export function translateAction(action?: string): string {
  if (!action) return 'Desconhecido';
  if (ACTION_MAP[action]) return ACTION_MAP[action];

  return action.replace(/_/g, ' ');
}
