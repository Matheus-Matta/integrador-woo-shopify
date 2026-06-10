import assert from 'node:assert/strict';

const baseUrl = process.env.WOO_COMPAT_BASE_URL || 'http://localhost:3005';
const consumerKey = process.env.DEFAULT_CONSUMER_KEY || 'ck_local';
const consumerSecret = process.env.DEFAULT_CONSUMER_SECRET || 'cs_local';
const authQuery = `consumer_key=${encodeURIComponent(consumerKey)}&consumer_secret=${encodeURIComponent(consumerSecret)}`;
const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function withAuth(path) {
  return `${path}${path.includes('?') ? '&' : '?'}${authQuery}`;
}

async function parse(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function api(path, init = {}) {
  const response = await fetch(`${baseUrl}${withAuth(path)}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const body = await parse(response);
  assert.equal(response.ok, true, `${init.method || 'GET'} ${path} failed: ${response.status} ${JSON.stringify(body)}`);
  return { response, body };
}

async function webhook(path, payload) {
  const body = JSON.stringify(payload);
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-shopify-hmac-sha256': 'skip-hmac-test',
      'x-shopify-delivery-id': `test-${runId}-${path}`,
      'x-shopify-topic': path.includes('orders') ? 'orders/create' : path.includes('customers') ? 'customers/create' : 'products/create',
    },
    body,
  });
  const parsed = await parse(response);
  assert.notEqual(response.status, 401, `${path} rejected HMAC. Start the dev server with SKIP_HMAC=true for this test.`);
  assert.equal(response.ok, true, `${path} failed: ${response.status} ${JSON.stringify(parsed)}`);
  assert.equal(parsed.wooCompatibleSync?.synced, true, `${path} did not report Woo-compatible sync`);
  return parsed;
}

async function cleanup(ids) {
  for (const id of ids.orders.reverse()) await api(`/wp-json/wc/v3/orders/${id}?force=true`, { method: 'DELETE' }).catch(() => null);
  for (const id of ids.customers.reverse()) await api(`/wp-json/wc/v3/customers/${id}?force=true`, { method: 'DELETE' }).catch(() => null);
  for (const id of ids.products.reverse()) await api(`/wp-json/wc/v3/products/${id}?force=true`, { method: 'DELETE' }).catch(() => null);
}

const ids = { products: [], customers: [], orders: [] };
const sku = `SHOPIFY-SYNC-${runId}`;
const email = `shopify-sync-${runId}@example.com`;
const shopifyCustomerId = `cust-${runId}`;

try {
  console.log(`Testing Shopify webhook -> Woo-compatible Mongo sync at ${baseUrl}`);

  await webhook('/api/webhooks/shopify/products/create', {
    id: `prod-${runId}`,
    title: 'Produto Shopify Webhook Sync',
    handle: `produto-shopify-webhook-sync-${runId}`,
    body_html: '<p>Produto vindo do webhook Shopify</p>',
    product_type: 'Teste',
    vendor: 'Async Woo',
    status: 'active',
    variants: [{ id: `var-${runId}`, sku, price: '199.90', compare_at_price: '249.90', inventory_quantity: 7 }],
    images: [{ id: 1, src: 'https://cdn.example.com/product.jpg', alt: 'Produto' }],
    created_at: '2026-06-10T10:00:00Z',
    updated_at: '2026-06-10T10:00:00Z',
  });

  const products = await api(`/wp-json/wc/v3/products?sku=${encodeURIComponent(sku)}`);
  assert.equal(products.body.length, 1, 'product webhook should save one Woo-compatible product');
  assert.equal(products.body[0].name, 'Produto Shopify Webhook Sync');
  ids.products.push(products.body[0].id);

  await webhook('/api/webhooks/shopify/customers/create', {
    id: shopifyCustomerId,
    email,
    first_name: 'Cliente',
    last_name: 'Webhook',
    phone: '21999999999',
    tags: 'vip,teste',
    default_address: {
      first_name: 'Cliente',
      last_name: 'Webhook',
      address1: 'Rua Teste',
      city: 'Sao Goncalo',
      province_code: 'RJ',
      zip: '24400-000',
      country_code: 'BR',
      phone: '21999999999',
    },
    created_at: '2026-06-10T10:00:00Z',
    updated_at: '2026-06-10T10:00:00Z',
  });

  const customers = await api(`/wp-json/wc/v3/customers?email=${encodeURIComponent(email)}`);
  assert.equal(customers.body.length, 1, 'customer webhook should save one Woo-compatible customer');
  assert.equal(customers.body[0].email, email);
  ids.customers.push(customers.body[0].id);

  await webhook('/api/webhooks/shopify/orders/create', {
    id: `order-${runId}`,
    name: `#SYNC-${runId}`,
    order_number: `SYNC-${runId}`,
    email,
    contact_email: email,
    currency: 'BRL',
    financial_status: 'paid',
    fulfillment_status: null,
    total_price: '199.90',
    subtotal_price: '199.90',
    total_discounts: '0.00',
    customer: {
      id: shopifyCustomerId,
      email,
      first_name: 'Cliente',
      last_name: 'Webhook',
      phone: '21999999999',
    },
    billing_address: {
      first_name: 'Cliente',
      last_name: 'Webhook',
      address1: 'Rua Teste',
      city: 'Sao Goncalo',
      province_code: 'RJ',
      zip: '24400-000',
      country_code: 'BR',
      phone: '21999999999',
    },
    shipping_address: {
      first_name: 'Cliente',
      last_name: 'Webhook',
      address1: 'Rua Teste',
      city: 'Sao Goncalo',
      province_code: 'RJ',
      zip: '24400-000',
      country_code: 'BR',
    },
    line_items: [{ id: 1, product_id: `prod-${runId}`, variant_id: `var-${runId}`, name: 'Produto Shopify Webhook Sync', sku, quantity: 1, price: '199.90' }],
    shipping_lines: [],
    discount_codes: [],
    created_at: '2026-06-10T10:00:00Z',
    updated_at: '2026-06-10T10:00:00Z',
  });

  const orders = await api(`/wp-json/wc/v3/orders?number=${encodeURIComponent(`#SYNC-${runId}`)}`);
  assert.equal(orders.body.length, 1, 'order webhook should save one Woo-compatible order');
  assert.equal(orders.body[0].status, 'processing');
  assert.equal(orders.body[0].customer_id, customers.body[0].id, 'order should be linked to webhook customer');
  assert.equal(Boolean(orders.body[0]._id), false, 'order response should not expose Mongo _id');
  assert.equal(Boolean(orders.body[0].customer_ref), false, 'order response should not expose customer_ref');
  ids.orders.push(orders.body[0].id);

  await cleanup(ids);
  console.log('Shopify webhook sync test passed.');
} catch (error) {
  await cleanup(ids);
  console.error(error);
  process.exitCode = 1;
}
