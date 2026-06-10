import { mapShopifyOrderStatusToWooStatus } from '../status-mapper';

type ShopifyOrder = Record<string, unknown> & {
  id?: string | number;
  name?: string;
  order_number?: string | number;
  created_at?: string;
  updated_at?: string;
  currency?: string;
  financial_status?: string;
  fulfillment_status?: string | null;
  total_price?: string;
  subtotal_price?: string;
  total_discounts?: string;
  customer?: Record<string, unknown>;
  billing_address?: Record<string, unknown>;
  shipping_address?: Record<string, unknown>;
  line_items?: Array<Record<string, unknown>>;
  shipping_lines?: Array<Record<string, unknown>>;
  discount_codes?: Array<Record<string, unknown>>;
  note?: string;
  tags?: string;
  cancelled_at?: string | null;
};

function date(value?: string) {
  return value ? value.replace(/\.\d+Z$/, '').replace('Z', '') : new Date().toISOString().replace(/\.\d+Z$/, '');
}

function addressToWoo(address: Record<string, unknown> = {}, email = '', phone = '') {
  return {
    first_name: address.first_name || '',
    last_name: address.last_name || '',
    company: address.company || '',
    address_1: address.address1 || '',
    address_2: address.address2 || '',
    city: address.city || '',
    state: address.province_code || address.province || '',
    postcode: address.zip || '',
    country: address.country_code || address.country || '',
    email,
    phone: phone || address.phone || '',
  };
}

function shippingTotal(order: ShopifyOrder) {
  const set = order.total_shipping_price_set as Record<string, unknown> | undefined;
  const shopMoney = set?.shop_money as Record<string, unknown> | undefined;
  return String(shopMoney?.amount ?? '0.00');
}

export function normalizeShopifyOrderToWooOrder(shopifyOrder: ShopifyOrder) {
  const created = date(shopifyOrder.created_at);
  const modified = date(shopifyOrder.updated_at);
  const customer = shopifyOrder.customer || {};
  const customerEmail = String(customer.email || shopifyOrder.email || '');
  const billing = addressToWoo(shopifyOrder.billing_address, customerEmail, String(customer.phone || ''));
  const shipping = addressToWoo(shopifyOrder.shipping_address, customerEmail, String(customer.phone || ''));

  return {
    shopify_id: shopifyOrder.id ? String(shopifyOrder.id) : '',
    shopify_customer_id: customer.id ? String(customer.id) : '',
    number: String(shopifyOrder.name || shopifyOrder.order_number || shopifyOrder.id || ''),
    created_via: 'shopify',
    status: mapShopifyOrderStatusToWooStatus(shopifyOrder.financial_status, shopifyOrder.fulfillment_status, shopifyOrder.cancelled_at),
    currency: shopifyOrder.currency || 'BRL',
    date_created: created,
    date_created_gmt: created,
    date_modified: modified,
    date_modified_gmt: modified,
    discount_total: String(shopifyOrder.total_discounts || '0.00'),
    shipping_total: shippingTotal(shopifyOrder),
    total: String(shopifyOrder.total_price || '0.00'),
    customer_id: 0,
    billing,
    shipping,
    customer_note: shopifyOrder.note || '',
    line_items: (shopifyOrder.line_items || []).map((item, index) => ({
      id: Number(item.id || index + 1),
      name: item.name || item.title || '',
      product_id: Number(item.product_id || 0),
      variation_id: Number(item.variant_id || 0),
      quantity: Number(item.quantity || 1),
      tax_class: '',
      subtotal: String(item.pre_tax_price || item.price || '0.00'),
      subtotal_tax: '0.00',
      total: String(item.price || '0.00'),
      total_tax: '0.00',
      taxes: [],
      meta_data: [
        { key: 'shopify_product_id', value: item.product_id ? String(item.product_id) : '' },
        { key: 'shopify_variant_id', value: item.variant_id ? String(item.variant_id) : '' },
      ],
      sku: item.sku || '',
      price: Number(item.price || 0),
    })),
    shipping_lines: (shopifyOrder.shipping_lines || []).map((line, index) => ({
      id: Number(line.id || index + 1),
      method_title: line.title || line.code || '',
      method_id: line.code || 'shopify_shipping',
      total: String(line.price || '0.00'),
      total_tax: '0.00',
      taxes: [],
      meta_data: [],
    })),
    coupon_lines: (shopifyOrder.discount_codes || []).map((coupon, index) => ({
      id: index + 1,
      code: coupon.code || '',
      discount: String(coupon.amount || '0.00'),
      discount_tax: '0.00',
      meta_data: [],
    })),
    meta_data: [
      { key: 'shopify_financial_status', value: shopifyOrder.financial_status || '' },
      { key: 'shopify_fulfillment_status', value: shopifyOrder.fulfillment_status || '' },
      { key: 'shopify_tags', value: shopifyOrder.tags || '' },
    ],
    raw_shopify: shopifyOrder,
  };
}
