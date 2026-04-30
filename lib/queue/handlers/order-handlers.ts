/**
 * Handlers para a fila "orders" — contém toda a lógica de negócio das rotas:
 * shop-customer-create, shop-customer-update, shop-order-create,
 * shop-order-update, woo-order-update
 */
import { AxiosError } from 'axios';
import { getCpfFromOrder } from '../../services/shopify';
import {
  getCustomerByEmail,
  createCustomer,
  updateCustomer,
  findWooOrderByShopifyId,
  createOrder,
  updateOrder,
  WooOrder,
  getCouponByCode,
  createCoupon,
  WooInstance,
} from '../../services/woocommerce';
import {
  getOrderDetails,
  markOrderAsPaid,
  createFulfillment,
  markFulfillmentDelivered,
} from '../../services/shopify';
import { logCustomer, logOrder, logError } from '../../services/logger';
import {
  s,
  digits,
  money,
  lower,
  arrayOf,
  mapStatus,
  getPaymentData,
  buildLineItems,
  buildLineItemsForCoupons,
  mergeLineItems,
  mergeLineItemsForCoupons,
  buildShippingLines,
  buildCoupons,
  getCpfFromShopify,
  getNumberFromShopify,
  getNeighborhoodFromShopify,
  getDeliveryDateFromShopify,
  getDeliveryTypeFromShopify,
  getWooMetaValue,
  WooLineItem,
} from '../../utils/helpers';

// ─── Cupons: garantir existência no Woo e montar coupon_lines ─────────────

async function ensureCouponsForOrder(
  instance: WooInstance,
  order: Record<string, unknown>,
): Promise<{ code: string }[]> {
  // 1) discount_codes (preferencial, pois traz amount explícito por código)
  const dc = arrayOf<{ code?: string; amount?: string; type?: string }>(order?.discount_codes)
    .filter((d) => d && d.code)
    .map((d) => ({
      code: String(d.code || '').trim(),
      amount: String(d.amount ?? '0'),
      type: String(d.type || '').toLowerCase(),
    }));

  // 2) discount_applications (fallback quando discount_codes vier vazio)
  const da = arrayOf<{ code?: string; value?: string; value_type?: string; type?: string }>(order?.discount_applications)
    .filter((a) => a && a.code)
    .map((a) => ({
      code: String(a.code || '').trim(),
      amount: String(a.value ?? '0'),
      type: String(a.value_type || a.type || '').toLowerCase(),
    }));

  // Unir por código, priorizando discount_codes sobre applications
  const map = new Map<string, { code: string; amount: string; type: string }>();
  for (const it of da) if (it.code) map.set(it.code, it);
  for (const it of dc) if (it.code) map.set(it.code, it); // sobrescreve se existir no fallback

  if (map.size === 0) return [];

  const couponLines: { code: string }[] = [];

  for (const { code, amount, type } of map.values()) {
    if (!code) continue;
    const rawType = (type || '').toLowerCase();
    const discount_type = rawType === 'percentage' ? 'percent' : 'fixed_cart';
    const amt = String(amount ?? '0');

    const existing = await getCouponByCode(instance, code);
    if (!existing) {
      try {
        await createCoupon(instance, {
          code,
          amount: amt,
          discount_type,
          description: 'Criado automaticamente pela integração Shopify',
        });
      } catch (e) {
        console.warn(`[coupons] Falha ao criar cupom ${code} no Woo — prosseguindo sem aplicar`, e);
        continue;
      }
    }
    couponLines.push({ code });
  }

  return couponLines;
}

// ─── shop-customer-create ──────────────────────────────────────────────────

export async function handleShopCustomerCreate(order: Record<string, unknown>): Promise<void> {
  const adminGid = s(order?.admin_graphql_api_id);
  const email = s(order?.contact_email ?? order?.email);

  let cpf = '';
  if (adminGid) {
    cpf = await getCpfFromOrder(adminGid);
  }

  const customer = (order?.customer as Record<string, unknown>) ?? {};
  const bill = (order?.billing_address as Record<string, unknown>) ?? {};
  const ship = (order?.shipping_address as Record<string, unknown>) ?? {};
  const defAddr = (customer?.default_address as Record<string, unknown>) ?? {};

  const firstName = s(customer?.first_name ?? bill?.first_name ?? defAddr?.first_name);
  const lastName = s(customer?.last_name ?? bill?.last_name ?? defAddr?.last_name);
  const phone = digits(s(defAddr?.phone ?? bill?.phone ?? ship?.phone));

  const payload: Record<string, unknown> = {
    email,
    first_name: firstName,
    last_name: lastName,
    billing: {
      first_name: firstName, last_name: lastName, company: '',
      address_1: s(bill?.address1 ?? defAddr?.address1),
      address_2: s(bill?.address2 ?? defAddr?.address2),
      city: s(bill?.city ?? defAddr?.city),
      state: s(bill?.province_code ?? defAddr?.province_code ?? 'RJ'),
      postcode: s(bill?.zip ?? defAddr?.zip),
      country: s(bill?.country_code ?? defAddr?.country_code ?? 'BR'),
      email, phone, cpf: digits(cpf) || cpf,
    },
    shipping: {
      first_name: s(ship?.first_name ?? bill?.first_name ?? firstName),
      last_name: s(ship?.last_name ?? bill?.last_name ?? lastName), company: '',
      address_1: s(ship?.address1 ?? bill?.address1 ?? defAddr?.address1),
      address_2: s(ship?.address2 ?? bill?.address2 ?? defAddr?.address2),
      city: s(ship?.city ?? bill?.city ?? defAddr?.city),
      state: s(ship?.province_code ?? bill?.province_code ?? defAddr?.province_code ?? 'RJ'),
      postcode: s(ship?.zip ?? bill?.zip ?? defAddr?.zip),
      country: s(ship?.country_code ?? bill?.country_code ?? defAddr?.country_code ?? 'BR'),
      phone,
    },
    meta_data: cpf ? [{ key: 'billing_cpf', value: digits(cpf) || cpf }] : [],
  };

  const created = await createCustomer('starchats', payload);
  await logCustomer({ email, woo_customer_id: created.id, woo_instance: 'starchats', action: 'create', webhook: order, payload, response: created, status: 'success' });
}

// ─── shop-customer-update ──────────────────────────────────────────────────

export async function handleShopCustomerUpdate(order: Record<string, unknown>): Promise<void> {
  const adminGid = s(order?.admin_graphql_api_id);
  const email = s(order?.contact_email ?? order?.email);

  if (!email) throw new Error('Email obrigatório');

  let cpf = '';
  if (adminGid) cpf = await getCpfFromOrder(adminGid);

  const existing = await getCustomerByEmail('starchats', email);
  if (!existing) {
    await logCustomer({ email, woo_instance: 'starchats', action: 'update_skipped_not_found', webhook: order, status: 'skipped' as never });
    return;
  }

  const customer = (order?.customer as Record<string, unknown>) ?? {};
  const bill = (order?.billing_address as Record<string, unknown>) ?? {};
  const ship = (order?.shipping_address as Record<string, unknown>) ?? {};
  const defAddr = (customer?.default_address as Record<string, unknown>) ?? {};

  const firstName = s(customer?.first_name ?? bill?.first_name ?? defAddr?.first_name);
  const lastName = s(customer?.last_name ?? bill?.last_name ?? defAddr?.last_name);
  const phone = digits(s(defAddr?.phone ?? bill?.phone ?? ship?.phone));

  const payload: Record<string, unknown> = {
    email, first_name: firstName, last_name: lastName,
    billing: {
      first_name: firstName, last_name: lastName, company: '',
      address_1: s(bill?.address1 ?? defAddr?.address1),
      address_2: s(bill?.address2 ?? defAddr?.address2),
      city: s(bill?.city ?? defAddr?.city),
      state: s(bill?.province_code ?? defAddr?.province_code ?? 'RJ'),
      postcode: s(bill?.zip ?? defAddr?.zip),
      country: s(bill?.country_code ?? defAddr?.country_code ?? 'BR'),
      email, phone, cpf: digits(cpf) || cpf,
    },
    shipping: {
      first_name: s(ship?.first_name ?? bill?.first_name ?? firstName),
      last_name: s(ship?.last_name ?? bill?.last_name ?? lastName), company: '',
      address_1: s(ship?.address1 ?? bill?.address1 ?? defAddr?.address1),
      address_2: s(ship?.address2 ?? bill?.address2 ?? defAddr?.address2),
      city: s(ship?.city ?? bill?.city ?? defAddr?.city),
      state: s(ship?.province_code ?? bill?.province_code ?? defAddr?.province_code ?? 'RJ'),
      postcode: s(ship?.zip ?? bill?.zip ?? defAddr?.zip),
      country: s(ship?.country_code ?? bill?.country_code ?? defAddr?.country_code ?? 'BR'),
      phone,
    },
    meta_data: [
      { key: 'customer_id', value: s(order?.id ?? '') },
      ...(cpf ? [{ key: 'billing_cpf', value: digits(cpf) || cpf }] : []),
    ],
  };

  const updated = await updateCustomer('starchats', existing.id, payload);
  await logCustomer({ email, woo_customer_id: updated.id, woo_instance: 'starchats', action: 'update', webhook: order, payload, response: updated, status: 'success' });
}

// ─── shop-order-create ─────────────────────────────────────────────────────

export async function handleShopOrderCreate(order: Record<string, unknown>): Promise<void> {
  const email = s(order?.contact_email ?? order?.email);
  const shopifyOrderId = String(order?.id ?? '');

  if (!email || !shopifyOrderId) throw new Error('email e id do pedido são obrigatórios');

  // ── Idempotência: verifica se o pedido já existe no Woo ───────────────────
  // Garante que dois webhooks orders/create (pending + paid) não criem dois
  // pedidos. Usa busca por email para obter o customerId sem depender de cache.
  const existingCustomerForCheck = await getCustomerByEmail('starseguro', email);
  if (existingCustomerForCheck) {
    const existingOrder = await findWooOrderByShopifyId('starseguro', existingCustomerForCheck.id, shopifyOrderId);
    if (existingOrder) {
      // Pedido já existe — encerra com sucesso sem criar duplicata.
      console.log(`[shop-order-create] Pedido Shopify ${shopifyOrderId} já existe no Woo (id=${existingOrder.id}) — ignorando criação duplicada`);
      await logOrder({ shopify_order_id: shopifyOrderId, woo_order_id: existingOrder.id, woo_instance: 'starseguro', action: 'create_skipped_duplicate', webhook: order, status: 'skipped' });
      return; // encerra sem erro — não vai para retentativa
    }
  }

  let wooCustomer = await getCustomerByEmail('starchats', email);

  if (!wooCustomer) {
    const bill = (order?.billing_address as Record<string, unknown>) ?? {};
    const ship = (order?.shipping_address as Record<string, unknown>) ?? {};
    const shopCust = (order?.customer as Record<string, unknown>) ?? {};
    const defAddr = (shopCust?.default_address as Record<string, unknown>) ?? {};

    const firstName = s(shopCust?.first_name ?? bill?.first_name ?? defAddr?.first_name);
    const lastName = s(shopCust?.last_name ?? bill?.last_name ?? defAddr?.last_name);
    const phone = digits(s(defAddr?.phone ?? bill?.phone ?? ship?.phone));

    const customerPayload: Record<string, unknown> = {
      email, first_name: firstName, last_name: lastName,
      billing: {
        first_name: firstName, last_name: lastName,
        address_1: s(bill?.address1 ?? defAddr?.address1),
        address_2: s(bill?.address2 ?? defAddr?.address2),
        city: s(bill?.city ?? defAddr?.city),
        state: s(bill?.province_code ?? defAddr?.province_code ?? 'RJ'),
        postcode: s(bill?.zip ?? defAddr?.zip),
        country: s(bill?.country_code ?? defAddr?.country_code ?? 'BR'),
        email, phone,
      },
      shipping: {
        first_name: s(ship?.first_name ?? bill?.first_name ?? firstName),
        last_name: s(ship?.last_name ?? bill?.last_name ?? lastName),
        address_1: s(ship?.address1 ?? bill?.address1 ?? defAddr?.address1),
        address_2: s(ship?.address2 ?? bill?.address2 ?? defAddr?.address2),
        city: s(ship?.city ?? bill?.city ?? defAddr?.city),
        state: s(ship?.province_code ?? bill?.province_code ?? defAddr?.province_code ?? 'RJ'),
        postcode: s(ship?.zip ?? bill?.zip ?? defAddr?.zip),
        country: s(ship?.country_code ?? bill?.country_code ?? defAddr?.country_code ?? 'BR'),
        email, phone,
      },
    };

    try {
      const created = await createCustomer('starchats', customerPayload);
      await logCustomer({ email, woo_customer_id: created.id, woo_instance: 'starchats', action: 'create', webhook: order, payload: customerPayload, response: created, status: 'success' });
    } catch (customerErr: unknown) {
      const axErr = customerErr instanceof AxiosError ? customerErr : null;
      const wooMsg = JSON.stringify(axErr?.response?.data ?? '').toLowerCase();
      const isAlreadyExists = wooMsg.includes('registered') || wooMsg.includes('email') || axErr?.response?.status === 400;
      if (!isAlreadyExists) throw customerErr;
    }
    wooCustomer = await getCustomerByEmail('starchats', email);
  }

  const bill = (order?.billing_address as Record<string, unknown>) ?? {};
  const ship = (order?.shipping_address as Record<string, unknown>) ?? {};
  const cpfBase = getCpfFromShopify(order);
  const cpfFinal = digits(cpfBase) || cpfBase;
  const billingNumber = getNumberFromShopify(order, bill);
  const billingNeighborhood = getNeighborhoodFromShopify(order, bill);
  const shippingNumber = getNumberFromShopify(order, ship) || billingNumber;
  const shippingNeighborhood = getNeighborhoodFromShopify(order, ship) || billingNeighborhood;
  const { payment_method, payment_method_title } = getPaymentData(order);

  const meta_data = [
    { key: '_shopify_order_id', value: shopifyOrderId },
    { key: '_shopify_order_number', value: String(order?.order_number ?? '') },
    { key: '_shopify_name', value: s(order?.name) },
    { key: '_shopify_order_url', value: s(order?.order_status_url) },
    { key: '_shopify_financial_status', value: s(order?.financial_status) },
    ...(cpfFinal ? [{ key: '_billing_cpf', value: cpfFinal }, { key: '_billing_persontype', value: '1' }] : []),
    ...(billingNumber ? [{ key: '_billing_number', value: billingNumber }] : []),
    ...(billingNeighborhood ? [{ key: '_billing_neighborhood', value: billingNeighborhood }] : []),
    ...(shippingNumber ? [{ key: '_shipping_number', value: shippingNumber }] : []),
    ...(shippingNeighborhood ? [{ key: '_shipping_neighborhood', value: shippingNeighborhood }] : []),
    { 
      key: '_shopify_coupon_codes', 
      value: arrayOf<{ code: string }>(order?.discount_codes).map(c => c.code).join(', ') 
    },
  ];
  const couponLines = await ensureCouponsForOrder('starseguro', order);

  const payload: Record<string, unknown> = {
    status: mapStatus(order),
    currency: s(order?.currency ?? order?.presentment_currency ?? 'BRL'),
    payment_method, payment_method_title,
    transaction_id: shopifyOrderId,
    customer_id: wooCustomer?.id,
    billing: {
      first_name: s(bill?.first_name), last_name: s(bill?.last_name),
      company: s(bill?.company), address_1: s(bill?.address1), address_2: s(bill?.address2),
      city: s(bill?.city), state: s(bill?.province_code), postcode: s(bill?.zip),
      country: s(bill?.country_code), email, phone: s(bill?.phone ?? order?.phone),
      ...(cpfFinal ? { persontype: '1', cpf: cpfFinal } : {}),
      ...(billingNumber ? { number: billingNumber } : {}),
      ...(billingNeighborhood ? { neighborhood: billingNeighborhood } : {}),
    },
    shipping: {
      first_name: s(ship?.first_name ?? bill?.first_name),
      last_name: s(ship?.last_name ?? bill?.last_name),
      company: s(ship?.company),
      address_1: s(ship?.address1 ?? bill?.address1), address_2: s(ship?.address2 ?? bill?.address2),
      city: s(ship?.city ?? bill?.city), state: s(ship?.province_code ?? bill?.province_code),
      postcode: s(ship?.zip ?? bill?.zip), country: s(ship?.country_code ?? bill?.country_code),
      ...(shippingNumber ? { number: shippingNumber } : {}),
      ...(shippingNeighborhood ? { neighborhood: shippingNeighborhood } : {}),
    },
    // Itens e cupons: se houver discount_codes, garantimos o cupom no Woo e
    // deixamos o Woo calcular o desconto via coupon_lines (sem duplicar allocations).
    line_items: couponLines.length > 0 ? buildLineItemsForCoupons(order) : buildLineItems(order),
    shipping_lines: buildShippingLines(order),
    coupon_lines: couponLines,
    meta_data,
    customer_note: s(order?.note),
  };

  try {
    const created = await createOrder('starseguro', payload);
    await logOrder({ shopify_order_id: shopifyOrderId, shopify_order_name: s(order?.name), woo_order_id: created.id, woo_instance: 'starseguro', action: 'create', webhook: order, payload, response: created, status: 'success' });
  } catch (err: any) {
    const details = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    
    // Registra no log de erros geral
    await logError({
      flow: 'shop-order-create',
      error_message: `Erro ao criar no WooCommerce: ${details}`,
      payload: { shopifyOrderId, payload },
      entity_type: 'order',
      entity_id: shopifyOrderId,
      shopify_order_id: shopifyOrderId,
      stack: err.stack
    });

    // Registra no log do pedido específico para aparecer no dashboard
    await logOrder({
      shopify_order_id: shopifyOrderId,
      shopify_order_name: s(order?.name),
      action: 'create_failed',
      payload,
      response: err.response?.data || { error: err.message },
      status: 'error'
    });

    throw err;
  }
}

// ─── Helpers para shop-order-update ───────────────────────────────────────

function buildOrderPayload(
  order: Record<string, unknown>,
  shopifyOrderId: string,
  email: string,
  customerId: number,
  cpfFinal: string,
  existingShippingLines?: WooOrder['shipping_lines'],
  existingLineItems?: WooLineItem[],
  couponLines?: { code: string }[],
): Record<string, unknown> {
  const bill = (order?.billing_address as Record<string, unknown>) ?? {};
  const ship = (order?.shipping_address as Record<string, unknown>) ?? {};
  const billingNumber = getNumberFromShopify(order, bill);
  const billingNeighborhood = getNeighborhoodFromShopify(order, bill);
  const shippingNumber = getNumberFromShopify(order, ship) || billingNumber;
  const shippingNeighborhood = getNeighborhoodFromShopify(order, ship) || billingNeighborhood;
  const deliveryDate = getDeliveryDateFromShopify(order);
  const deliveryType = getDeliveryTypeFromShopify(order);
  const { payment_method, payment_method_title } = getPaymentData(order);

  const meta_data = [
    { key: '_billing_cpf', value: cpfFinal }, { key: '_billing_persontype', value: '1' },
    { key: '_billing_number', value: billingNumber }, { key: '_billing_neighborhood', value: billingNeighborhood },
    { key: '_shipping_number', value: shippingNumber }, { key: '_shipping_neighborhood', value: shippingNeighborhood },
    { key: '_shopify_financial_status', value: s(order?.financial_status) },
    { key: '_shopify_name', value: s(order?.name) },
    { key: '_shopify_order_id', value: shopifyOrderId },
    { key: '_shopify_order_number', value: String(order?.order_number ?? '') },
    { key: '_shopify_order_url', value: s(order?.order_status_url) },
    { key: '_shopify_updated_at', value: s(order?.updated_at ?? order?.processed_at ?? order?.created_at) },
    { key: 'delivery_date', value: deliveryDate },
    { key: 'delivery_type', value: deliveryType },
    { 
      key: '_shopify_coupon_codes', 
      value: arrayOf<{ code: string }>(order?.discount_codes).map(c => c.code).join(', ') 
    },
  ].filter((item) => s(item.value) !== '');

  // Só sobrescreve billing/shipping se o webhook trouxer endereço preenchido.
  // Webhooks orders/updated do Shopify às vezes omitem billing_address/shipping_address,
  // o que zeraria os dados já salvos no WooCommerce.
  const isBillingPresent = Boolean(s(bill?.first_name) || s(bill?.address1));
  const isShippingPresent = Boolean(s(ship?.first_name) || s(ship?.address1));

  return {
    status: mapStatus(order),
    currency: s(order?.currency ?? order?.presentment_currency ?? 'BRL'),
    payment_method, payment_method_title,
    transaction_id: shopifyOrderId,
    customer_id: customerId,
    ...(isBillingPresent ? {
      billing: {
        first_name: s(bill?.first_name), last_name: s(bill?.last_name),
        company: s(bill?.company), address_1: s(bill?.address1), address_2: s(bill?.address2),
        city: s(bill?.city), state: s(bill?.province_code), postcode: s(bill?.zip),
        country: s(bill?.country_code), email, phone: s(bill?.phone ?? order?.phone),
        persontype: '1', cpf: cpfFinal, number: billingNumber, neighborhood: billingNeighborhood,
      },
    } : {}),
    ...(isShippingPresent ? {
      shipping: {
        first_name: s(ship?.first_name ?? bill?.first_name), last_name: s(ship?.last_name ?? bill?.last_name),
        company: s(ship?.company),
        address_1: s(ship?.address1 ?? bill?.address1), address_2: s(ship?.address2 ?? bill?.address2),
        city: s(ship?.city ?? bill?.city), state: s(ship?.province_code ?? bill?.province_code),
        postcode: s(ship?.zip ?? bill?.zip), country: s(ship?.country_code ?? bill?.country_code),
        number: shippingNumber, neighborhood: shippingNeighborhood,
      },
    } : {}),
    line_items: (() => {
      const applyCoupons = (couponLines && couponLines.length > 0);
      if (applyCoupons) {
        return existingLineItems && existingLineItems.length > 0
          ? mergeLineItemsForCoupons(order, existingLineItems)
          : buildLineItemsForCoupons(order);
      }
      return existingLineItems && existingLineItems.length > 0
        ? mergeLineItems(order, existingLineItems)
        : buildLineItems(order);
    })(),
    shipping_lines: buildShippingLines(order, existingShippingLines),
    coupon_lines: couponLines && couponLines.length > 0 ? couponLines : buildCoupons(order),
    meta_data,
    customer_note: s(order?.note),
  };
}

// ─── shop-order-update ─────────────────────────────────────────────────────

export async function handleShopOrderUpdate(order: Record<string, unknown>): Promise<void> {
  const shopifyOrderId = String(order?.id ?? '');
  const adminGid = s(order?.admin_graphql_api_id);
  const email = s(order?.contact_email ?? order?.email);

  if (!email || !shopifyOrderId) throw new Error('email e id do pedido são obrigatórios');

  let cpfFromShopify = '';
  if (adminGid) cpfFromShopify = await getCpfFromOrder(adminGid);

  let wooCustomer = await getCustomerByEmail('starchats', email);

  if (!wooCustomer) {
    const bill = (order?.billing_address as Record<string, unknown>) ?? {};
    const ship = (order?.shipping_address as Record<string, unknown>) ?? {};
    const shopCust = (order?.customer as Record<string, unknown>) ?? {};
    const defAddr = (shopCust?.default_address as Record<string, unknown>) ?? {};

    const firstName = s(shopCust?.first_name ?? bill?.first_name ?? defAddr?.first_name);
    const lastName = s(shopCust?.last_name ?? bill?.last_name ?? defAddr?.last_name);
    const phone = digits(s(defAddr?.phone ?? bill?.phone ?? ship?.phone));

    const customerPayload: Record<string, unknown> = {
      email, first_name: firstName, last_name: lastName,
      billing: {
        first_name: firstName, last_name: lastName,
        address_1: s(bill?.address1 ?? defAddr?.address1),
        address_2: s(bill?.address2 ?? defAddr?.address2),
        city: s(bill?.city ?? defAddr?.city),
        state: s(bill?.province_code ?? defAddr?.province_code ?? 'RJ'),
        postcode: s(bill?.zip ?? defAddr?.zip),
        country: s(bill?.country_code ?? defAddr?.country_code ?? 'BR'),
        email, phone,
      },
      shipping: {
        first_name: s(ship?.first_name ?? bill?.first_name ?? firstName),
        last_name: s(ship?.last_name ?? bill?.last_name ?? lastName),
        address_1: s(ship?.address1 ?? bill?.address1 ?? defAddr?.address1),
        address_2: s(ship?.address2 ?? bill?.address2 ?? defAddr?.address2),
        city: s(ship?.city ?? bill?.city ?? defAddr?.city),
        state: s(ship?.province_code ?? bill?.province_code ?? defAddr?.province_code ?? 'RJ'),
        postcode: s(ship?.zip ?? bill?.zip ?? defAddr?.zip),
        country: s(ship?.country_code ?? bill?.country_code ?? defAddr?.country_code ?? 'BR'),
        phone,
      },
      meta_data: cpfFromShopify ? [{ key: 'billing_cpf', value: digits(cpfFromShopify) || cpfFromShopify }] : [],
    };

    try {
      const created = await createCustomer('starchats', customerPayload);
      await logCustomer({ email, woo_customer_id: created.id, woo_instance: 'starchats', action: 'create', webhook: order, payload: customerPayload, response: created, status: 'success' });
    } catch (customerErr: unknown) {
      // Extrai mensagem real do WooCommerce (Axios encapsula o body)
      const axErr = customerErr instanceof AxiosError ? customerErr : null;
      const wooMsg = JSON.stringify(axErr?.response?.data ?? '').toLowerCase();
      const ceMsg = (customerErr as Error).message?.toLowerCase() ?? '';
      const isAlreadyExists = wooMsg.includes('registered') || wooMsg.includes('email') ||
        ceMsg.includes('registered') || ceMsg.includes('email') ||
        axErr?.response?.status === 400;
      if (isAlreadyExists) {
        wooCustomer = await getCustomerByEmail('starchats', email);
      } else throw customerErr;
    }
    if (!wooCustomer) wooCustomer = await getCustomerByEmail('starchats', email);
    if (!wooCustomer) throw new Error(`Cliente WooCommerce não encontrado para email: ${email}`);
  }

  const bill = (order?.billing_address as Record<string, unknown>) ?? {};
  const cpfCandidates = [
    cpfFromShopify,
    getCpfFromShopify(order),
    s(bill?.cpf),
    getWooMetaValue(wooCustomer.meta_data ?? [], ['_billing_cpf', 'billing_cpf', 'cpf'], /cpf/i),
  ];
  const cpfFinal = digits(cpfCandidates.find((c) => c) ?? '') || (cpfCandidates.find((c) => c) ?? '');
  if (!cpfFinal) throw new Error('CPF obrigatório não encontrado em nenhuma fonte disponível.');

  const existingOrder = await findWooOrderByShopifyId('starchats', wooCustomer.id, shopifyOrderId);

  if (existingOrder) {
    const ensuredCoupons = await ensureCouponsForOrder('starchats', order);
    const payload = buildOrderPayload(
      order, shopifyOrderId, email, wooCustomer.id, cpfFinal,
      existingOrder.shipping_lines,
      existingOrder.line_items,
      ensuredCoupons,
    );
    try {
      const updated = await updateOrder('starchats', existingOrder.id, payload);
      await logOrder({ shopify_order_id: shopifyOrderId, shopify_order_name: s(order?.name), woo_order_id: updated.id, woo_instance: 'starchats', action: 'update', webhook: order, payload, response: updated, status: 'success' });
    } catch (err: any) {
      const details = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      
      // Registra no log de erros geral
      await logError({
        flow: 'shop-order-update',
        error_message: `Erro ao atualizar no WooCommerce: ${details}`,
        payload: { shopifyOrderId, wooOrderId: existingOrder.id, payload },
        entity_type: 'order',
        entity_id: shopifyOrderId,
        shopify_order_id: shopifyOrderId,
        woo_order_id: existingOrder.id,
        stack: err.stack
      });

      // Registra no log do pedido específico para aparecer no dashboard
      await logOrder({
        shopify_order_id: shopifyOrderId,
        shopify_order_name: s(order?.name),
        woo_order_id: existingOrder.id,
        action: 'update_failed',
        payload,
        response: err.response?.data || { error: err.message },
        status: 'error'
      });

      throw err;
    }
  } else {
    // Pedido ainda não existe no Woo — provavelmente o orders/create ainda não processou.
    // Lança erro para que o job vá para o FIM da fila e tente novamente após os demais jobs.
    throw new Error(`[shop-order-update] Pedido Shopify ${shopifyOrderId} não encontrado no Woo — será retentado`);
  }
}

// ─── woo-order-update ──────────────────────────────────────────────────────

export async function handleWooOrderUpdate(body: Record<string, unknown>): Promise<void> {
  const meta = arrayOf<{ key: string; value: unknown }>(body?.meta_data);
  const findMeta = (key: string): string => { const f = meta.find((m) => m.key === key); return f ? s(f.value) : ''; };

  const wooStatus = lower(body?.status);
  const shopifyOrderId = findMeta('_shopify_order_id') || s(body?.transaction_id);

  if (!shopifyOrderId) throw new Error('Nenhum _shopify_order_id ou transaction_id encontrado');

  if (wooStatus !== 'completed') {
    await logOrder({ shopify_order_id: shopifyOrderId, woo_order_id: Number(body?.id), action: 'update_skipped_not_completed', webhook: body, payload: { wooStatus }, status: 'skipped' });
    return;
  }

  const shopifyOrderGid = `gid://shopify/Order/${shopifyOrderId}`;
  const deliveryType = lower(findMeta('delivery_type'));
  const deliveryDate = findMeta('delivery_date');
  const paymentText = `${s(body?.payment_method)} ${s(body?.payment_method_title)}`.toLowerCase();
  const isCOD = /cash on delivery|\bcod\b|pagamento na entrega/.test(paymentText);
  const wooOrderId = Number(body?.id);

  const ordDetails = await getOrderDetails(shopifyOrderGid);
  const shopifyOrder = ordDetails?.data?.order;
  if (!shopifyOrder) throw new Error(`Pedido ${shopifyOrderGid} não encontrado no Shopify`);

  const fulfillmentOrderId = shopifyOrder.fulfillmentOrders?.nodes?.[0]?.id ?? '';

  if (isCOD && shopifyOrder.canMarkAsPaid) {
    const paidRes = await markOrderAsPaid(shopifyOrderGid);
    await logOrder({ shopify_order_id: shopifyOrderId, woo_order_id: wooOrderId, action: 'mark_paid', webhook: body, response: paidRes, status: 'success' });
  } else {
    await logOrder({ shopify_order_id: shopifyOrderId, woo_order_id: wooOrderId, action: 'completed_non_cod_payment_untouched', webhook: body, status: 'success' });
  }

  if (deliveryType !== 'pickup' && fulfillmentOrderId) {
    const fulfRes = await createFulfillment(fulfillmentOrderId);
    const fulfillmentId = fulfRes?.data?.fulfillmentCreate?.fulfillment?.id;
    await logOrder({ shopify_order_id: shopifyOrderId, woo_order_id: wooOrderId, action: 'create_fulfillment', webhook: body, payload: { fulfillmentOrderId, deliveryDate }, response: fulfRes, status: 'success' });

    if (fulfillmentId) {
      const deliveredRes = await markFulfillmentDelivered(fulfillmentId);
      await logOrder({ shopify_order_id: shopifyOrderId, woo_order_id: wooOrderId, action: 'mark_delivered', webhook: body, response: deliveredRes, status: 'success' });
    }
  } else if (!fulfillmentOrderId) {
    await logOrder({ shopify_order_id: shopifyOrderId, woo_order_id: wooOrderId, action: 'skip_fulfillment_missing_id', webhook: body, status: 'skipped' });
  }
}
