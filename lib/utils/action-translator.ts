export const ACTION_MAP: Record<string, string> = {
  // Orders & Customers (Shopify -> Woo)
  'create': 'Webhook Shopify → Criou no WooCommerce',
  'update': 'Webhook Shopify → Atualizou no WooCommerce',
  'create_skipped_duplicate': 'Webhook Shopify → Ignorado: Duplicado',
  'update_skipped_not_found': 'Webhook Shopify → Ignorado: Não Encontrado no Woo',
  'webhook_received': 'Webhook Shopify → Recebido',
  
  // Orders (Woo -> Shopify)
  'mark_paid': 'Webhook Woo → Marcou Pago no Shopify',
  'create_fulfillment': 'Webhook Woo → Criou Entrega no Shopify',
  'mark_delivered': 'Webhook Woo → Marcou Entregue no Shopify',
  'update_skipped_not_completed': 'Webhook Woo → Ignorado: Não Concluído',

  // Products (Woo -> Shopify)
  'sku_not_found': 'Webhook Woo → Ignorado: SKU não encontrado no Shopify',
  'sku_not_found_after_refresh': 'Webhook Woo → Erro: SKU não encontrado após refresh',
  'title_update': 'Webhook Woo → Atualizou Título no Shopify',
  'stock_update': 'Webhook Woo → Atualizou Estoque no Shopify',
  'price_update': 'Webhook Woo → Atualizou Preço no Shopify',
};

export function translateAction(action?: string): string {
  if (!action) return 'Desconhecido';
  if (ACTION_MAP[action]) return ACTION_MAP[action];
  
  // Fallback se não encontrar
  return action.replace(/_/g, ' ');
}
