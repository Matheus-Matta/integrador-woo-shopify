/**
 * Dashboard — sincronização de webhooks no Shopify e WooCommerce
 *
 * Shopify  → cria via GraphQL (webhookSubscriptionCreate)
 * WooCommerce → cria via REST  (POST /wp-json/wc/v3/webhooks)
 */
import axios, { AxiosError } from 'axios';

import { config } from '../config';

// ─── Tipos internos ─────────────────────────────────────────────────────────

interface WebhookStatus {
  platform: 'shopify' | 'woocommerce';
  topic: string;
  endpoint: string;
  status: 'ok' | 'created' | 'deleted' | 'error';
  id?: string | number;
  registeredUrl?: string;
  error?: string;
}

// ─── Extrai mensagem real de erros axios ─────────────────────────────────────

function errMsg(e: unknown): string {
  if (e instanceof AxiosError) {
    const d = e.response?.data;
    if (d) {
      if (typeof d === 'string') return d.slice(0, 300);
      if (typeof d === 'object') {
        const msg = (d as Record<string, unknown>).message ?? (d as Record<string, unknown>).error;
        if (msg) return String(msg).slice(0, 300);
      }
      return JSON.stringify(d).slice(0, 300);
    }
    return e.message;
  }
  return (e as Error).message ?? String(e);
}

// ─── Configuração de webhooks esperados ─────────────────────────────────────

function expectedWebhooks(domain: string) {
  return {
    shopify: [
      { topic: 'ORDERS_CREATE',    callbackUrl: `${domain}/webhook/shop-order-create`    },
      { topic: 'ORDERS_CREATE',    callbackUrl: `${domain}/webhook/shop-customer-create` },
      { topic: 'ORDERS_UPDATED',   callbackUrl: `${domain}/webhook/shop-order-update`    },
      { topic: 'CUSTOMERS_UPDATE', callbackUrl: `${domain}/webhook/shop-customer-update` },
    ],
    woocommerce: [
      { topic: 'order.updated',   deliveryUrl: `${domain}/webhook/woo-order-update` },
      { topic: 'product.updated', deliveryUrl: `${domain}/webhook/woo-product`      },
    ],
  };
}

// ─── Shopify — GraphQL ───────────────────────────────────────────────────────

const shopifyGqlUrl = config.shopify.url;

const shopifyHeaders = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': config.shopify.accessToken,
};

async function listShopifyWebhooks(): Promise<{ id: string; topic: string; callbackUrl: string }[]> {
  const query = `{
    webhookSubscriptions(first: 50) {
      edges { node { id topic endpoint { ... on WebhookHttpEndpoint { callbackUrl } } } }
    }
  }`;
  const { data } = await axios.post(shopifyGqlUrl, { query }, { headers: shopifyHeaders });
  const edges: unknown[] = data?.data?.webhookSubscriptions?.edges ?? [];
  return (edges as { node: { id: string; topic: string; endpoint: { callbackUrl: string } } }[]).map(
    (e) => ({ id: e.node.id, topic: e.node.topic, callbackUrl: e.node.endpoint?.callbackUrl ?? '' }),
  );
}

export async function createShopifyWebhook(topic: string, callbackUrl: string): Promise<string> {
  const mutation = `
    mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
        webhookSubscription { id }
        userErrors { field message }
      }
    }`;
  const variables = {
    topic,
    webhookSubscription: { callbackUrl, format: 'JSON' },
  };
  const { data } = await axios.post(shopifyGqlUrl, { query: mutation, variables }, { headers: shopifyHeaders });
  const errors = data?.data?.webhookSubscriptionCreate?.userErrors as { message: string }[] | undefined;
  if (errors && errors.length > 0) throw new Error(errors.map((e) => e.message).join('; '));
  const id = data?.data?.webhookSubscriptionCreate?.webhookSubscription?.id;
  if (!id) throw new Error('Shopify não retornou ID — verifique token e permissões');
  return id as string;
}

async function deleteShopifyWebhook(id: string): Promise<void> {
  const mutation = `
    mutation webhookSubscriptionDelete($id: ID!) {
      webhookSubscriptionDelete(id: $id) {
        deletedWebhookSubscriptionId
        userErrors { field message }
      }
    }`;
  const { data } = await axios.post(shopifyGqlUrl, { query: mutation, variables: { id } }, { headers: shopifyHeaders });
  const errors = data?.data?.webhookSubscriptionDelete?.userErrors as { message: string }[] | undefined;
  if (errors && errors.length > 0) throw new Error(errors.map((e) => e.message).join('; '));
}

async function syncShopifyWebhooks(domain: string, force = false): Promise<WebhookStatus[]> {
  const results: WebhookStatus[] = [];

  let existing: { id: string; topic: string; callbackUrl: string }[] = [];
  try {
    existing = await listShopifyWebhooks();
  } catch (e) {
    console.error('[webhooks] Erro ao listar webhooks Shopify:', errMsg(e));
  }

  for (const wh of expectedWebhooks(domain).shopify) {
    // Em modo force: deleta TODOS os webhooks com o mesmo tópico antes de criar
    if (force) {
      const matches = existing.filter((e) => e.topic === wh.topic);
      for (const old of matches) {
        try { await deleteShopifyWebhook(old.id); } catch { /* ignora falha de delete */ }
      }
    }

    const found = force ? undefined : existing.find(
      (e) => e.topic === wh.topic && e.callbackUrl === wh.callbackUrl,
    );

    if (found) {
      results.push({ platform: 'shopify', topic: wh.topic, endpoint: wh.callbackUrl, status: 'ok', id: found.id, registeredUrl: found.callbackUrl });
    } else {
      try {
        const id = await createShopifyWebhook(wh.topic, wh.callbackUrl);
        results.push({ platform: 'shopify', topic: wh.topic, endpoint: wh.callbackUrl, status: 'created', id });
      } catch (err) {
        results.push({ platform: 'shopify', topic: wh.topic, endpoint: wh.callbackUrl, status: 'error', error: errMsg(err) });
      }
    }
  }
  return results;
}

// ─── WooCommerce — REST ──────────────────────────────────────────────────────

function wooClient() {
  return axios.create({
    baseURL: `${config.woo.url}/wp-json/wc/v3`,
    auth: { username: config.woo.key, password: config.woo.secret },
    headers: { 'Content-Type': 'application/json' },
    timeout: 20_000,
  });
}

async function listWooWebhooks(): Promise<{ id: number; topic: string; delivery_url: string; status: string }[]> {
  const client = wooClient();
  const { data } = await client.get<{ id: number; topic: string; delivery_url: string; status: string }[]>(
    '/webhooks?per_page=50',
  );
  return data;
}

export async function createWooWebhook(topic: string, deliveryUrl: string): Promise<number> {
  const client = wooClient();
  const { data } = await client.post<{ id: number }>('/webhooks', {
    name: `Integrador — ${topic}`,
    status: 'active',
    topic,
    delivery_url: deliveryUrl,
    secret: config.woo.webhookSecret,
  });
  return data.id;
}

async function deleteWooWebhook(id: number): Promise<void> {
  const client = wooClient();
  await client.delete(`/webhooks/${id}?force=true`);
}

async function syncWooWebhooks(domain: string, force = false): Promise<WebhookStatus[]> {
  const results: WebhookStatus[] = [];

  let existing: { id: number; topic: string; delivery_url: string; status: string }[] = [];
  try {
    existing = await listWooWebhooks();
  } catch (e) {
    console.error('[webhooks] Erro ao listar webhooks WooCommerce:', errMsg(e));
  }

  for (const wh of expectedWebhooks(domain).woocommerce) {
    // Em modo force: deleta TODOS os webhooks com o mesmo tópico antes de criar
    if (force) {
      const matches = existing.filter((e) => e.topic === wh.topic);
      for (const old of matches) {
        try { await deleteWooWebhook(old.id); } catch { /* ignora falha de delete */ }
      }
    }

    const found = force ? undefined : existing.find(
      (e) => e.topic === wh.topic && e.delivery_url === wh.deliveryUrl && e.status === 'active',
    );
    if (found) {
      results.push({ platform: 'woocommerce', topic: wh.topic, endpoint: wh.deliveryUrl, status: 'ok', id: found.id, registeredUrl: found.delivery_url });
    } else {
      try {
        const id = await createWooWebhook(wh.topic, wh.deliveryUrl);
        results.push({ platform: 'woocommerce', topic: wh.topic, endpoint: wh.deliveryUrl, status: 'created', id });
      } catch (err) {
        results.push({ platform: 'woocommerce', topic: wh.topic, endpoint: wh.deliveryUrl, status: 'error', error: errMsg(err) });
      }
    }
  }
  return results;
}

export async function getWebhookStatus() {
  const domain = config.domain;
  if (!domain) throw new Error('Variável DOMAIN não configurada no .env');

  const [shopify, woocommerce] = await Promise.allSettled([
    listShopifyWebhooks(),
    listWooWebhooks(),
  ]);

  const expected = expectedWebhooks(domain);

  const mapStatus = (
    platform: 'shopify' | 'woocommerce',
    expectedList: { topic: string; callbackUrl?: string; deliveryUrl?: string }[],
    existingList: { topic: string; callbackUrl?: string; delivery_url?: string }[],
  ) =>
    expectedList.map((wh) => {
      const url = wh.callbackUrl ?? wh.deliveryUrl ?? '';
      const found = existingList.find(
        (e) =>
          e.topic === wh.topic &&
          (e.callbackUrl === url || e.delivery_url === url),
      );
      return { platform, topic: wh.topic, endpoint: url, exists: !!found, id: found ? (found as Record<string, unknown>).id : null };
    });

  return {
    domain,
    shopify:
      shopify.status === 'fulfilled'
        ? mapStatus('shopify', expected.shopify, shopify.value as { topic: string; callbackUrl?: string; delivery_url?: string }[])
        : { error: errMsg((shopify as PromiseRejectedResult).reason) },
    woocommerce:
      woocommerce.status === 'fulfilled'
        ? mapStatus('woocommerce', expected.woocommerce, woocommerce.value as { topic: string; callbackUrl?: string; delivery_url?: string }[])
        : { error: errMsg((woocommerce as PromiseRejectedResult).reason) },
  };
}

export async function getAllWebhooksStatus() {
  const domain = config.domain || 'N/A';
  const [shopify, woocommerce] = await Promise.allSettled([
    listShopifyWebhooks(),
    listWooWebhooks(),
  ]);

  const expected = expectedWebhooks(domain);

  const processAll = (
    platform: 'shopify' | 'woocommerce',
    expectedList: { topic: string; callbackUrl?: string; deliveryUrl?: string }[],
    existingList: any[]
  ) => {
    return existingList.map((e) => {
      const url = e.callbackUrl ?? e.delivery_url ?? '';
      const isExpected = expectedList.some(
        (wh) => wh.topic === e.topic && (wh.callbackUrl === url || wh.deliveryUrl === url)
      );
      return {
        platform,
        topic: e.topic,
        endpoint: url,
        exists: true,
        id: e.id,
        isCustom: !isExpected,
      };
    });
  };

  return {
    domain,
    shopify:
      shopify.status === 'fulfilled'
        ? processAll('shopify', expected.shopify, shopify.value)
        : { error: errMsg((shopify as PromiseRejectedResult).reason) },
    woocommerce:
      woocommerce.status === 'fulfilled'
        ? processAll('woocommerce', expected.woocommerce, woocommerce.value)
        : { error: errMsg((woocommerce as PromiseRejectedResult).reason) },
  };
}

export async function runWebhookSync(platforms: string[], force: boolean) {
  const domain = config.domain;
  if (!domain) throw new Error('Variável DOMAIN não configurada no .env');

  const results: WebhookStatus[] = [];

  if (platforms.includes('shopify')) {
    try {
      results.push(...(await syncShopifyWebhooks(domain, force)));
    } catch (err) {
      results.push({ platform: 'shopify', topic: 'all', endpoint: '', status: 'error', error: errMsg(err) });
    }
  }
  if (platforms.includes('woocommerce')) {
    try {
      results.push(...(await syncWooWebhooks(domain, force)));
    } catch (err) {
      results.push({ platform: 'woocommerce', topic: 'all', endpoint: '', status: 'error', error: errMsg(err) });
    }
  }

  const hasError = results.some((r) => r.status === 'error');
  return { hasError, domain, results, force };
}

