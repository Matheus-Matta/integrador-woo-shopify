import axios from 'axios';
import { config } from '../config';
import { cacheGet, cacheSet } from '../db/redis';

const shopifyClient = axios.create({
  baseURL: config.shopify.url,
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': config.shopify.accessToken,
  },
  timeout: 30_000,
});

// ─── Tipos ─────────────────────────────────────────────────────────────────

export interface ShopifyProductVariant {
  id: string;
  sku: string;
  product: { id: string; title: string };
  inventoryItem: {
    id: string;
    inventoryLevels: {
      edges: {
        node: {
          quantities: { name: string; quantity: number }[];
          location: { id: string; name: string };
        };
      }[];
    };
  };
}

export interface ShopifyProductBySku {
  data: {
    productVariants: {
      edges: { node: ShopifyProductVariant }[];
    };
  };
}

export interface ShopifyOrderDetails {
  data: {
    order: {
      id: string;
      name: string;
      canMarkAsPaid: boolean;
      displayFinancialStatus: string;
      displayFulfillmentStatus: string;
      fulfillmentOrders: {
        nodes: { id: string; status: string; requestStatus: string }[];
      };
    };
  };
}

// ─── Helpers GraphQL ───────────────────────────────────────────────────────

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const { data } = await shopifyClient.post('', { query, variables });
  return data as T;
}

// ─── Produto ───────────────────────────────────────────────────────────────

export async function getProductBySku(sku: string): Promise<ShopifyProductBySku> {
  const cacheKey = `shopify:sku:${sku}`;
  const cached = await cacheGet<ShopifyProductBySku>(cacheKey);
  if (cached) return cached;

  const query = `query {
    productVariants(query: "sku:${sku}", first: 1) {
      edges {
        node {
          id sku
          product { id title }
          inventoryItem {
            id
            inventoryLevels(first: 1) {
              edges {
                node {
                  quantities(names: ["available"]) { name quantity }
                  location { id name }
                }
              }
            }
          }
        }
      }
    }
  }`;

  const result = await gql<ShopifyProductBySku>(query);
  await cacheSet(cacheKey, result);
  return result;
}

export async function updateProductTitle(productId: string, title: string): Promise<unknown> {
  const query = `mutation($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id title }
      userErrors { field message }
    }
  }`;
  const result = await gql(query, { input: { id: productId, title } });
  // Invalida cache de qualquer variante desse produto (por segurança)
  return result;
}

export async function updateStock(
  inventoryItemId: string,
  locationId: string,
  delta: number,
): Promise<unknown> {
  const query = `mutation {
    inventoryAdjustQuantities(input: {
      reason: "restock",
      name: "available",
      changes: [{
        inventoryItemId: "${inventoryItemId}",
        locationId: "${locationId}",
        delta: ${delta}
      }]
    }) {
      inventoryAdjustmentGroup {
        createdAt reason
        changes { name delta }
      }
      userErrors { field message }
    }
  }`;
  return gql(query);
}

export async function updatePrice(
  productId: string,
  variantId: string,
  price: string,
  compareAtPrice: string | null,
): Promise<unknown> {
  const query = `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id price compareAtPrice }
      userErrors { field message }
    }
  }`;
  return gql(query, {
    productId,
    variants: [{ id: variantId, price, compareAtPrice }],
  });
}

// ─── Pedido / CPF ──────────────────────────────────────────────────────────

export async function getCpfFromOrder(adminGid: string): Promise<string> {
  const query = `query ($id: ID!) {
    order(id: $id) {
      id name
      localizationExtensions(first: 10) {
        nodes { purpose countryCode title value }
      }
    }
  }`;
  const result = await gql<{
    data: { order: { localizationExtensions: { nodes: { value: string }[] } } };
  }>(query, { id: adminGid });
  return result?.data?.order?.localizationExtensions?.nodes?.[0]?.value ?? '';
}

export async function getOrderDetails(orderGid: string): Promise<ShopifyOrderDetails> {
  const query = `query GetOrderSyncState($id: ID!) {
    order(id: $id) {
      id name canMarkAsPaid
      displayFinancialStatus displayFulfillmentStatus
      fulfillmentOrders(first: 50) {
        nodes { id status requestStatus }
      }
    }
  }`;
  return gql<ShopifyOrderDetails>(query, { id: orderGid });
}

export async function markOrderAsPaid(orderGid: string): Promise<unknown> {
  const query = `mutation MarkOrderAsPaid($input: OrderMarkAsPaidInput!) {
    orderMarkAsPaid(input: $input) {
      order { id name canMarkAsPaid displayFinancialStatus }
      userErrors { field message }
    }
  }`;
  return gql(query, { input: { id: orderGid } });
}

export async function createFulfillment(fulfillmentOrderId: string): Promise<{
  data: { fulfillmentCreate: { fulfillment: { id: string; status: string } } };
}> {
  const query = `mutation CreateFulfillment($fulfillment: FulfillmentInput!, $message: String) {
    fulfillmentCreate(fulfillment: $fulfillment, message: $message) {
      fulfillment { id status }
      userErrors { field message }
    }
  }`;
  return gql(query, {
    fulfillment: {
      notifyCustomer: false,
      lineItemsByFulfillmentOrder: [{ fulfillmentOrderId }],
    },
    message: 'Pedido concluído no WooCommerce',
  });
}

export async function markFulfillmentDelivered(fulfillmentId: string): Promise<unknown> {
  const query = `mutation CreateFulfillmentEvent($fulfillmentEvent: FulfillmentEventInput!) {
    fulfillmentEventCreate(fulfillmentEvent: $fulfillmentEvent) {
      fulfillmentEvent { id status message happenedAt }
      userErrors { field message }
    }
  }`;
  return gql(query, {
    fulfillmentEvent: {
      fulfillmentId,
      status: 'DELIVERED',
      happenedAt: new Date().toISOString(),
      message: 'Entrega concluída via sincronização WooCommerce',
    },
  });
}

// ─── Scheduler: listagem de pedidos recentes ───────────────────────────────

export interface ShopifyOrderNode {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  lineItems: { nodes: { sku: string; quantity: number; title: string }[] };
}

export interface ShopifyOrdersPage {
  data: {
    orders: {
      edges: { node: ShopifyOrderNode }[];
      pageInfo: { hasNextPage: boolean; endCursor: string };
    };
  };
}

/** Busca os N pedidos mais recentes do Shopify (paginação via cursor). */
export async function getRecentShopifyOrders(
  first = 50,
  after?: string,
): Promise<ShopifyOrdersPage> {
  const afterClause = after ? `, after: "${after}"` : '';
  const query = `{
    orders(first: ${first}, sortKey: UPDATED_AT, reverse: true${afterClause}) {
      edges {
        node {
          id name email createdAt updatedAt
          displayFinancialStatus displayFulfillmentStatus
          lineItems(first: 50) {
            nodes { sku quantity title }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }`;
  return gql<ShopifyOrdersPage>(query);
}

// ─── Scheduler: listagem de produtos recentes ──────────────────────────────

export interface ShopifyVariantNode {
  id: string;
  sku: string;
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number;
  product: { id: string; title: string; updatedAt: string };
}

export interface ShopifyVariantsPage {
  data: {
    productVariants: {
      edges: { node: ShopifyVariantNode }[];
      pageInfo: { hasNextPage: boolean; endCursor: string };
    };
  };
}

/** Busca variantes com SKU atualizadas desde uma data (máx N). */
export async function getRecentShopifyProducts(
  first = 100,
  after?: string,
): Promise<ShopifyVariantsPage> {
  const afterClause = after ? `, after: "${after}"` : '';
  const query = `{
    productVariants(first: ${first}, sortKey: UPDATED_AT, reverse: true${afterClause}) {
      edges {
        node {
          id sku price compareAtPrice inventoryQuantity
          product { id title updatedAt }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }`;
  return gql<ShopifyVariantsPage>(query);
}
