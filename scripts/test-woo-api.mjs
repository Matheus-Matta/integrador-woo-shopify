import assert from 'node:assert/strict';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';

const baseUrl = process.env.WOO_COMPAT_BASE_URL || 'http://localhost:3005';
const localEnv = readLocalEnv();
const consumerKey = process.env.DEFAULT_CONSUMER_KEY || 'ck_local';
const consumerSecret = process.env.DEFAULT_CONSUMER_SECRET || 'cs_local';
const jwtSecret = process.env.JWT_SECRET || localEnv.JWT_SECRET;
const apiJwtUser = process.env.WOO_API_JWT_USER || localEnv.WOO_API_JWT_USER;
const apiJwtPassword = process.env.WOO_API_JWT_PASSWORD || localEnv.WOO_API_JWT_PASSWORD;
const authQuery = `consumer_key=${encodeURIComponent(consumerKey)}&consumer_secret=${encodeURIComponent(consumerSecret)}`;
const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createdIds = {
  products: [],
  customers: [],
  orders: [],
  categories: [],
  tags: [],
  attributes: [],
  attributeTerms: [],
};

function readLocalEnv() {
  if (!fs.existsSync('.env')) return {};
  return Object.fromEntries(
    fs
      .readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
        return [key, value];
      })
  );
}

function withAuth(path) {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}${authQuery}`;
}

async function parseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${withAuth(path)}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const body = await parseBody(response);
  assert.equal(response.ok, true, `${init.method || 'GET'} ${path} failed: ${response.status} ${JSON.stringify(body)}`);
  return { response, body };
}

async function requestRaw(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  return { response, body: await parseBody(response) };
}

function assertNoInternalFields(value, path = 'response') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.notEqual(key, '_id', `${path} leaked Mongo _id`);
    assert.notEqual(key, 'customer_ref', `${path} leaked customer_ref`);
    assert.notEqual(key, 'raw_shopify', `${path} leaked raw_shopify`);
    assertNoInternalFields(child, `${path}.${key}`);
  }
}

async function cleanup() {
  for (const id of createdIds.orders.reverse()) {
    await request(`/wp-json/wc/v3/orders/${id}?force=true`, { method: 'DELETE' }).catch(() => null);
  }
  for (const id of createdIds.customers.reverse()) {
    await request(`/wp-json/wc/v3/customers/${id}?force=true`, { method: 'DELETE' }).catch(() => null);
  }
  for (const id of createdIds.products.reverse()) {
    await request(`/wp-json/wc/v3/products/${id}?force=true`, { method: 'DELETE' }).catch(() => null);
  }
  for (const { attributeId, termId } of createdIds.attributeTerms.reverse()) {
    await request(`/wp-json/wc/v3/products/attributes/${attributeId}/terms/${termId}`, { method: 'DELETE' }).catch(() => null);
  }
  for (const id of createdIds.attributes.reverse()) {
    await request(`/wp-json/wc/v3/products/attributes/${id}`, { method: 'DELETE' }).catch(() => null);
  }
  for (const id of createdIds.tags.reverse()) {
    await request(`/wp-json/wc/v3/products/tags/${id}`, { method: 'DELETE' }).catch(() => null);
  }
  for (const id of createdIds.categories.reverse()) {
    await request(`/wp-json/wc/v3/products/categories/${id}`, { method: 'DELETE' }).catch(() => null);
  }
}

async function testStatusAndAuth() {
  const root = await requestRaw('/wp-json');
  assert.equal(root.response.ok, true, '/wp-json should be public');
  assert.equal(Array.isArray(root.body.namespaces), true, '/wp-json should expose namespaces');
  assert.equal(root.body.namespaces.includes('jwt-auth/v1'), true, '/wp-json should expose jwt-auth/v1');

  const wc = await requestRaw('/wp-json/wc/v3');
  assert.equal(wc.response.ok, true, '/wp-json/wc/v3 should be public');
  assert.equal(wc.body.namespace, 'wc/v3');

  const unauthorized = await requestRaw('/wp-json/wc/v3/products');
  assert.equal(unauthorized.response.status, 401, 'protected endpoints should reject missing auth');
  assert.equal(unauthorized.body.code, 'woocommerce_rest_cannot_view');

  const basic = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const basicAuth = await requestRaw('/wp-json/wc/v3/products?per_page=1', {
    headers: { authorization: `Basic ${basic}` },
  });
  assert.equal(basicAuth.response.ok, true, 'Basic Auth should be accepted');

  if (jwtSecret && apiJwtUser && apiJwtPassword) {
    const login = await requestRaw('/wp-json/jwt-auth/v1/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: apiJwtUser, password: apiJwtPassword }),
    });
    assert.equal(login.response.ok, true, 'JWT login should return a token');
    assert.equal(typeof login.body.token, 'string', 'JWT login should include token');
    assert.equal(login.body.token_type, 'Bearer');

    const bearer = await requestRaw('/wp-json/wc/v3/products?per_page=1', {
      headers: { authorization: `Bearer ${login.body.token}` },
    });
    assert.equal(bearer.response.ok, true, 'Bearer JWT from login should be accepted');

    const readOnlyToken = jwt.sign({ sub: 'woo-api', scope: 'read' }, jwtSecret, { expiresIn: '5m' });
    const deniedWrite = await requestRaw('/wp-json/wc/v3/products', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${readOnlyToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: `Produto Negado ${runId}` }),
    });
    assert.equal(deniedWrite.response.status, 401, 'read-only JWT should not write');
  }
}

async function testProductsAndTaxonomies() {
  const sku = `TEST-SKU-${runId}`;
  const product = await request('/wp-json/wc/v3/products', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Produto Teste Woo Compat',
      slug: `produto-teste-${runId}`,
      sku,
      type: 'simple',
      status: 'publish',
      price: '99.90',
      regular_price: '109.90',
      stock_status: 'instock',
      meta_data: [{ key: 'shopify_id', value: `shopify-product-${runId}` }],
    }),
  });
  createdIds.products.push(product.body.id);
  assert.equal(product.response.status, 201);
  assert.equal(product.body.sku, sku);
  assertNoInternalFields(product.body);

  const list = await request(`/wp-json/wc/v3/products?sku=${encodeURIComponent(sku)}&page=1&per_page=5`);
  assert.equal(list.response.headers.has('x-wp-total'), true, 'products list should return X-WP-Total');
  assert.equal(list.response.headers.has('x-wp-totalpages'), true, 'products list should return X-WP-TotalPages');
  assert.equal(list.body.length, 1, 'sku filter should find one product');

  const updated = await request(`/wp-json/wc/v3/products/${product.body.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ price: '89.90', stock_quantity: 4 }),
  });
  assert.equal(updated.body.price, '89.90');

  const variation = await request(`/wp-json/wc/v3/products/${product.body.id}/variations`, {
    method: 'POST',
    body: JSON.stringify({ sku: `${sku}-VAR`, regular_price: '89.90', price: '79.90' }),
  });
  assert.equal(variation.response.status, 201);
  assert.equal(variation.body.parent_id, product.body.id);

  const variations = await request(`/wp-json/wc/v3/products/${product.body.id}/variations`);
  assert.equal(variations.body.length, 1, 'variation list should include created variation');

  const category = await request('/wp-json/wc/v3/products/categories', {
    method: 'POST',
    body: JSON.stringify({ name: `Categoria ${runId}`, slug: `categoria-${runId}` }),
  });
  createdIds.categories.push(category.body.id);
  assert.equal(category.body.slug, `categoria-${runId}`);

  const tag = await request('/wp-json/wc/v3/products/tags', {
    method: 'POST',
    body: JSON.stringify({ name: `Tag ${runId}`, slug: `tag-${runId}` }),
  });
  createdIds.tags.push(tag.body.id);
  assert.equal(tag.body.slug, `tag-${runId}`);

  const attribute = await request('/wp-json/wc/v3/products/attributes', {
    method: 'POST',
    body: JSON.stringify({ name: `Cor ${runId}`, slug: `pa-cor-${runId}` }),
  });
  createdIds.attributes.push(attribute.body.id);
  assert.equal(attribute.body.name, `Cor ${runId}`);

  const term = await request(`/wp-json/wc/v3/products/attributes/${attribute.body.id}/terms`, {
    method: 'POST',
    body: JSON.stringify({ name: `Azul ${runId}`, slug: `azul-${runId}` }),
  });
  createdIds.attributeTerms.push({ attributeId: attribute.body.id, termId: term.body.id });
  assert.equal(term.body.attribute_id, attribute.body.id);

  const batch = await request('/wp-json/wc/v3/products/batch', {
    method: 'POST',
    body: JSON.stringify({
      create: [{ name: `Produto Batch ${runId}`, sku: `${sku}-BATCH`, price: '10.00' }],
      update: [{ id: product.body.id, status: 'draft' }],
      delete: [],
    }),
  });
  assert.equal(Array.isArray(batch.body.create), true);
  assert.equal(Array.isArray(batch.body.update), true);
  createdIds.products.push(...batch.body.create.map((item) => item.id).filter(Boolean));

  return { product, sku };
}

async function testCustomers() {
  const email = `cliente-${runId}@example.com`;
  const customer = await request('/wp-json/wc/v3/customers', {
    method: 'POST',
    body: JSON.stringify({
      email,
      first_name: 'Cliente',
      last_name: 'Teste',
      billing: { email, first_name: 'Cliente', last_name: 'Teste', phone: '21999999999' },
      shipping: { first_name: 'Cliente', last_name: 'Teste' },
      meta_data: [{ key: 'shopify_id', value: `shopify-customer-${runId}` }],
    }),
  });
  createdIds.customers.push(customer.body.id);
  assert.equal(customer.response.status, 201);
  assert.equal(customer.body.email, email);
  assertNoInternalFields(customer.body);

  const duplicate = await request('/wp-json/wc/v3/customers', {
    method: 'POST',
    body: JSON.stringify({ email, first_name: 'Cliente Atualizado' }),
  });
  assert.equal(duplicate.body.id, customer.body.id, 'same email should update existing customer');

  const list = await request(`/wp-json/wc/v3/customers?email=${encodeURIComponent(email)}&per_page=10`);
  assert.equal(list.body.length, 1, 'email filter should avoid duplicated customers');
  assert.equal(list.response.headers.has('x-wp-total'), true, 'customers list should return X-WP-Total');

  const patched = await request(`/wp-json/wc/v3/customers/${customer.body.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ last_name: 'Alterado' }),
  });
  assert.equal(patched.body.last_name, 'Alterado');

  const batch = await request('/wp-json/wc/v3/customers/batch', {
    method: 'POST',
    body: JSON.stringify({
      create: [{ email: `batch-${email}`, first_name: 'Batch' }],
      update: [{ id: customer.body.id, first_name: 'Cliente Batch Update' }],
      delete: [],
    }),
  });
  assert.equal(Array.isArray(batch.body.create), true);
  assert.equal(Array.isArray(batch.body.update), true);
  createdIds.customers.push(...batch.body.create.map((item) => item.id).filter(Boolean));

  return { customer, email };
}

async function testOrders({ customer, email, sku }) {
  const orderNumber = `ORDER-${runId}`;
  const order = await request('/wp-json/wc/v3/orders', {
    method: 'POST',
    body: JSON.stringify({
      number: orderNumber,
      status: 'processing',
      currency: 'BRL',
      total: '149.90',
      billing: { email, first_name: 'Cliente', last_name: 'Teste', phone: '21999999999' },
      shipping: { first_name: 'Cliente', last_name: 'Teste' },
      line_items: [{ name: 'Produto Teste Woo Compat', sku, quantity: 1, total: '149.90', price: 149.9 }],
    }),
  });
  createdIds.orders.push(order.body.id);
  assert.equal(order.response.status, 201);
  assert.equal(order.body.customer_id, customer.body.id, 'order should link to customer by billing.email');
  assert.equal(order.body.number, orderNumber);
  assertNoInternalFields(order.body);

  const byCustomer = await request(`/wp-json/wc/v3/orders?customer=${order.body.customer_id}&status=processing`);
  assert.equal(byCustomer.body.some((item) => item.id === order.body.id), true, 'customer/status filters should find order');
  assert.equal(byCustomer.response.headers.has('x-wp-total'), true, 'orders list should return X-WP-Total');

  const byEmail = await request(`/wp-json/wc/v3/orders?billing_email=${encodeURIComponent(email)}`);
  assert.equal(byEmail.body.some((item) => item.id === order.body.id), true, 'billing_email filter should find order');

  const byNumberAndTotal = await request(`/wp-json/wc/v3/orders?number=${encodeURIComponent(orderNumber)}&min_total=100&max_total=200`);
  assert.equal(byNumberAndTotal.body.length, 1, 'number/min_total/max_total filters should find order');

  const patched = await request(`/wp-json/wc/v3/orders/${order.body.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'completed' }),
  });
  assert.equal(patched.body.status, 'completed');

  const newCustomerEmail = `auto-customer-${runId}@example.com`;
  const autoCustomerOrder = await request('/wp-json/wc/v3/orders', {
    method: 'POST',
    body: JSON.stringify({
      number: `AUTO-${runId}`,
      total: '10.00',
      billing: { email: newCustomerEmail, first_name: 'Auto', last_name: 'Customer' },
      shipping: { first_name: 'Auto', last_name: 'Customer' },
      line_items: [],
    }),
  });
  createdIds.orders.push(autoCustomerOrder.body.id);
  assert.ok(autoCustomerOrder.body.customer_id > 0, 'order without customer_id should create/link a customer');

  const autoCustomer = await request(`/wp-json/wc/v3/customers?email=${encodeURIComponent(newCustomerEmail)}`);
  assert.equal(autoCustomer.body.length, 1, 'auto-created customer should be searchable by email');
  createdIds.customers.push(autoCustomer.body[0].id);

  const note = await request(`/wp-json/wc/v3/orders/${order.body.id}/notes`, {
    method: 'POST',
    body: JSON.stringify({ note: 'Nota criada pelo teste', customer_note: false }),
  });
  assert.equal(note.response.status, 201);
  const notes = await request(`/wp-json/wc/v3/orders/${order.body.id}/notes`);
  assert.equal(notes.body.some((item) => item.id === note.body.id), true, 'created note should be listed');
  await request(`/wp-json/wc/v3/orders/${order.body.id}/notes/${note.body.id}`, { method: 'DELETE' });

  const refund = await request(`/wp-json/wc/v3/orders/${order.body.id}/refunds`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Refund test', amount: '1.00' }),
  });
  assert.equal(refund.response.status, 201);
  const refunds = await request(`/wp-json/wc/v3/orders/${order.body.id}/refunds`);
  assert.equal(refunds.body.some((item) => item.id === refund.body.id), true, 'created refund should be listed');
  await request(`/wp-json/wc/v3/orders/${order.body.id}/refunds/${refund.body.id}`, { method: 'DELETE' });

  const batch = await request('/wp-json/wc/v3/orders/batch', {
    method: 'POST',
    body: JSON.stringify({
      create: [{ number: `BATCH-${runId}`, total: '20.00', billing: { email: `batch-order-${runId}@example.com` } }],
      update: [{ id: order.body.id, status: 'processing' }],
      delete: [],
    }),
  });
  assert.equal(Array.isArray(batch.body.create), true);
  assert.equal(Array.isArray(batch.body.update), true);
  createdIds.orders.push(...batch.body.create.map((item) => item.id).filter(Boolean));
}

try {
  console.log(`Testing Woo-compatible API at ${baseUrl}`);
  await testStatusAndAuth();
  const { product, sku } = await testProductsAndTaxonomies();
  const { customer, email } = await testCustomers();
  await testOrders({ customer, email, sku, product });
  await cleanup();
  console.log('Woo-compatible API integration tests passed.');
} catch (error) {
  await cleanup();
  console.error(error);
  process.exitCode = 1;
}
