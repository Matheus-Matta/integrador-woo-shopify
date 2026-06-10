type ShopifyAddress = Record<string, unknown>;

type ShopifyCustomer = {
  id?: string | number;
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  default_address?: ShopifyAddress;
  created_at?: string;
  updated_at?: string;
  tags?: string;
};

function date(value?: string) {
  return value ? value.replace(/\.\d+Z$/, '').replace('Z', '') : new Date().toISOString().replace(/\.\d+Z$/, '');
}

function addressToWoo(address: ShopifyAddress = {}, email = '', phone = '') {
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

export function normalizeShopifyCustomerToWooCustomer(shopifyCustomer: ShopifyCustomer) {
  const created = date(shopifyCustomer.created_at);
  const modified = date(shopifyCustomer.updated_at);
  const billing = addressToWoo(shopifyCustomer.default_address, shopifyCustomer.email || '', shopifyCustomer.phone || '');
  const { email, ...shipping } = billing;

  return {
    shopify_id: shopifyCustomer.id ? String(shopifyCustomer.id) : '',
    date_created: created,
    date_created_gmt: created,
    date_modified: modified,
    date_modified_gmt: modified,
    email: shopifyCustomer.email || '',
    first_name: shopifyCustomer.first_name || billing.first_name || '',
    last_name: shopifyCustomer.last_name || billing.last_name || '',
    role: 'customer',
    username: shopifyCustomer.email || '',
    billing,
    shipping,
    is_paying_customer: true,
    avatar_url: '',
    meta_data: [{ key: 'shopify_tags', value: shopifyCustomer.tags || '' }],
  };
}
