export function mapShopifyOrderStatusToWooStatus(financialStatus?: string | null, fulfillmentStatus?: string | null, cancelledAt?: string | null) {
  const financial = String(financialStatus || '').toLowerCase();
  const fulfillment = String(fulfillmentStatus || '').toLowerCase();

  if (cancelledAt || financial === 'voided' || financial === 'canceled' || financial === 'cancelled') return 'cancelled';
  if (financial === 'refunded' || financial === 'partially_refunded') return 'refunded';
  if (financial === 'pending') return 'pending';
  if (financial === 'authorized') return 'on-hold';
  if (financial === 'paid' && fulfillment === 'fulfilled') return 'completed';
  if (financial === 'paid') return 'processing';
  if (financial === 'failed') return 'failed';
  return 'processing';
}
