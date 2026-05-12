/**
 * Handler para jobs da fila "orders" originados do Lexos Hub.
 *
 * Fluxo:
 *   Webhook Lexos → ordersQueue ('lexos-order-create') → handleLexosOrderCreate
 *   → busca/cria cliente no WooCommerce → cria pedido no WooCommerce
 */
import { AxiosError } from 'axios';
import {
  getCustomerByEmail,
  createCustomer,
  findWooOrderByShopifyIdGlobal,
  createOrder,
  updateOrder,
  WooInstance,
} from '../../services/woocommerce';
import { logOrder, logCustomer, logError } from '../../services/logger';
import {
  s,
  digits,
  money,
  arrayOf,
  compactObject,
} from '../../utils/helpers';

// ─── Instância WooCommerce alvo ────────────────────────────────────────────
// Altere para a instância correta quando o cliente confirmar.
const WOO_INSTANCE: WooInstance = 'starseguro';

// ─── Tipos internos ────────────────────────────────────────────────────────

interface LexosCliente {
  nome?: string;
  documento?: string;
  email?: string;
  telefone?: string;
}

interface LexosItem {
  sku?: string;
  nome?: string;
  quantidade?: number;
  valor_unitario?: number;
}

interface LexosEntrega {
  cep?: string;
  cidade?: string;
  uf?: string;
  endereco?: string;
  numero?: string;
  bairro?: string;
  complemento?: string;
  transportadora?: string;
}

interface LexosPagamento {
  metodo?: string;
  valor_total?: number;
  valor_frete?: number;
  valor_desconto?: number;
}

interface LexosPedido {
  pedido_id?: string;
  numero_pedido?: string;
  canal?: string;
  status?: string;
  data_criacao?: string;
  cliente?: LexosCliente;
  itens?: LexosItem[];
  entrega?: LexosEntrega;
  pagamento?: LexosPagamento;
}

// ─── Mapeamento de status Lexos → WooCommerce ──────────────────────────────

const STATUS_MAP: Record<string, string> = {
  novo:          'pending',
  pago:          'processing',
  em_separacao:  'processing',
  faturado:      'processing',
  enviado:       'completed',
  entregue:      'completed',
  cancelado:     'cancelled',
  devolvido:     'refunded',
};

function mapLexosStatus(status: string | undefined): string {
  return STATUS_MAP[s(status).toLowerCase()] ?? 'pending';
}

// ─── Helpers de normalização ───────────────────────────────────────────────

/** Divide nome completo em primeiro/último nome. */
function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

/** Constrói line_items no formato WooCommerce a partir dos itens do Lexos.
 *  Cada item é explodido em qty=1 por unidade, seguindo o padrão do Shopify. */
function buildLexosLineItems(itens: LexosItem[]): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  for (const item of itens) {
    const qty = Number(item.quantidade ?? 1) || 1;
    const unitPrice = Number(item.valor_unitario ?? 0);
    for (let i = 0; i < qty; i++) {
      result.push({
        name: s(item.nome),
        sku: s(item.sku),
        quantity: 1,
        total: money(unitPrice),
      });
    }
  }
  return result;
}

/** Constrói shipping_lines quando existe valor de frete. */
function buildLexosShippingLines(
  entrega: LexosEntrega | undefined,
  pagamento: LexosPagamento | undefined,
): Record<string, unknown>[] {
  const frete = Number(pagamento?.valor_frete ?? 0);
  if (!frete) return [];
  const transportadora = s(entrega?.transportadora) || 'Marketplace';
  return [
    {
      method_id: 'lexos_shipping',
      method_title: `${transportadora} (R$ ${money(frete)})`,
      total: money(frete),
    },
  ];
}

// ─── Handler principal ─────────────────────────────────────────────────────

export async function handleLexosOrderCreate(
  payload: Record<string, unknown>,
): Promise<void> {
  // O payload pode vir diretamente como objeto `data` do webhook ou como o
  // body completo do evento (event + data). Normaliza os dois casos.
  const data = (payload.data ?? payload) as LexosPedido;

  const lexosOrderId  = s(data.pedido_id);
  const lexosOrderNum = s(data.numero_pedido);
  const canal         = s(data.canal);
  const cliente       = (data.cliente ?? {}) as LexosCliente;
  const itens         = arrayOf<LexosItem>(data.itens);
  const entrega       = (data.entrega ?? {}) as LexosEntrega;
  const pagamento     = (data.pagamento ?? {}) as LexosPagamento;

  if (!lexosOrderId) throw new Error('[lexos-order-create] pedido_id ausente no payload');

  const email = s(cliente.email);
  if (!email) {
    // Sem email não conseguimos criar/buscar cliente no WooCommerce.
    // Registra erro para investigação manual e interrompe sem retentativa.
    await logError({
      flow: 'lexos-order-create',
      error_message: 'Email do cliente ausente no payload Lexos — pedido ignorado',
      payload: data as unknown as Record<string, unknown>,
      entity_type: 'order',
      entity_id: lexosOrderId,
    });
    console.warn(`[lexos-order-create] Email ausente para pedido ${lexosOrderId} — ignorado`);
    return;
  }

  // ── Idempotência global: pedido já existe? ──────────────────────────────
  const existingOrder = await findWooOrderByShopifyIdGlobal(WOO_INSTANCE, lexosOrderId);
  if (existingOrder) {
    console.log(
      `[lexos-order-create] Pedido Lexos ${lexosOrderId} já existe no Woo (id=${existingOrder.id}) — ignorando`,
    );
    await logOrder({
      shopify_order_id: lexosOrderId,
      woo_order_id: existingOrder.id,
      woo_instance: WOO_INSTANCE,
      origin: 'lexos',
      action: 'create_skipped_duplicate',
      webhook: payload,
      status: 'skipped',
    });
    return;
  }

  // ── Busca ou cria cliente ───────────────────────────────────────────────
  let wooCustomer = await getCustomerByEmail(WOO_INSTANCE, email);

  if (!wooCustomer) {
    const { first: firstName, last: lastName } = splitName(s(cliente.nome));
    const phone   = digits(s(cliente.telefone));
    const cpf     = digits(s(cliente.documento)) || s(cliente.documento);
    const cidade  = s(entrega.cidade);
    const uf      = s(entrega.uf);
    const cep     = digits(s(entrega.cep));
    const address = s(entrega.endereco);

    const customerPayload = compactObject({
      email,
      first_name: firstName,
      last_name:  lastName,
      billing: compactObject({
        first_name: firstName,
        last_name:  lastName,
        email,
        phone,
        address_1: address,
        city:       cidade,
        state:      uf,
        postcode:   cep,
        country:    'BR',
        ...(cpf ? { cpf } : {}),
      }),
      shipping: compactObject({
        first_name: firstName,
        last_name:  lastName,
        address_1:  address,
        city:       cidade,
        state:      uf,
        postcode:   cep,
        country:    'BR',
      }),
      meta_data: cpf ? [{ key: 'billing_cpf', value: cpf }] : [],
    });

    try {
      const created = await createCustomer(WOO_INSTANCE, customerPayload);
      await logCustomer({
        email,
        woo_customer_id: created.id,
        woo_instance: WOO_INSTANCE,
        action: 'create',
        webhook: payload,
        payload: customerPayload,
        response: created,
        status: 'success',
      });
    } catch (customerErr: unknown) {
      const axErr = customerErr instanceof AxiosError ? customerErr : null;
      const wooMsg = JSON.stringify(axErr?.response?.data ?? '').toLowerCase();
      const isAlreadyExists =
        wooMsg.includes('registered') ||
        wooMsg.includes('email') ||
        axErr?.response?.status === 400;
      if (!isAlreadyExists) throw customerErr;
    }

    wooCustomer = await getCustomerByEmail(WOO_INSTANCE, email);
  }

  // ── Monta payload do pedido ─────────────────────────────────────────────
  const { first: firstName, last: lastName } = splitName(s(cliente.nome));
  const phone   = digits(s(cliente.telefone));
  const cpf     = digits(s(cliente.documento)) || s(cliente.documento);
  const cidade  = s(entrega.cidade);
  const uf      = s(entrega.uf);
  const cep     = digits(s(entrega.cep));
  const address = s(entrega.endereco);
  const numero  = s(entrega.numero);
  const bairro  = s(entrega.bairro);
  const compl   = s(entrega.complemento);

  const metaData = [
    { key: '_origin',             value: 'lexos' },
    { key: '_lexos_order_id',     value: lexosOrderId },
    { key: '_lexos_order_number', value: lexosOrderNum },
    { key: '_lexos_canal',        value: canal },
    { key: '_lexos_status',       value: s(data.status) },
    ...(cpf
      ? [
          { key: '_billing_cpf',        value: cpf },
          { key: '_billing_persontype', value: '1' },
        ]
      : []),
    ...(numero  ? [{ key: '_billing_number',       value: numero }]  : []),
    ...(bairro  ? [{ key: '_billing_neighborhood', value: bairro }]  : []),
    ...(numero  ? [{ key: '_shipping_number',       value: numero }]  : []),
    ...(bairro  ? [{ key: '_shipping_neighborhood', value: bairro }]  : []),
  ].filter((m) => s(m.value) !== '');

  const orderPayload = compactObject({
    status:      mapLexosStatus(data.status),
    currency:    'BRL',
    // transaction_id reusa o lexosOrderId para o findWooOrderByShopifyIdGlobal
    // funcionar em deduplicações futuras (ele busca por transaction_id também)
    transaction_id: lexosOrderId,
    customer_id:    wooCustomer?.id,
    payment_method:       s(pagamento.metodo) || 'lexos',
    payment_method_title: s(pagamento.metodo) || 'Lexos Hub',
    billing: compactObject({
      first_name: firstName,
      last_name:  lastName,
      email,
      phone,
      address_1:  address,
      address_2:  compl,
      city:       cidade,
      state:      uf,
      postcode:   cep,
      country:    'BR',
      ...(cpf    ? { persontype: '1', cpf } : {}),
      ...(numero ? { number: numero }       : {}),
      ...(bairro ? { neighborhood: bairro } : {}),
    }),
    shipping: compactObject({
      first_name: firstName,
      last_name:  lastName,
      address_1:  address,
      address_2:  compl,
      city:       cidade,
      state:      uf,
      postcode:   cep,
      country:    'BR',
      ...(numero ? { number: numero }       : {}),
      ...(bairro ? { neighborhood: bairro } : {}),
    }),
    line_items:     buildLexosLineItems(itens),
    shipping_lines: buildLexosShippingLines(entrega, pagamento),
    meta_data:      metaData,
  });

  // ── Cria o pedido no WooCommerce ────────────────────────────────────────
  try {
    const created = await createOrder(WOO_INSTANCE, orderPayload);
    console.info(
      `[lexos-order-create] Pedido Lexos ${lexosOrderId} criado no Woo (id=${created.id})`,
    );
    await logOrder({
      shopify_order_id: lexosOrderId,   // reutiliza o campo para logging centralizado
      shopify_order_name: lexosOrderNum,
      woo_order_id:   created.id,
      woo_instance:   WOO_INSTANCE,
      origin:         'lexos',
      action:         'create',
      webhook:        payload,
      payload:        orderPayload,
      response:       created,
      status:         'success',
    });
  } catch (err: unknown) {
    const axErr = err instanceof AxiosError ? err : null;
    const details = axErr?.response?.data
      ? JSON.stringify(axErr.response.data)
      : (err as Error).message;

    await logError({
      flow: 'lexos-order-create',
      error_message: `Erro ao criar pedido no WooCommerce: ${details}`,
      payload: { lexosOrderId, orderPayload },
      entity_type: 'order',
      entity_id: lexosOrderId,
      stack: (err as Error).stack,
    });

    await logOrder({
      shopify_order_id: lexosOrderId,
      shopify_order_name: lexosOrderNum,
      origin:  'lexos',
      action:  'create_failed',
      payload: orderPayload,
      response: axErr?.response?.data ?? { error: (err as Error).message },
      status:  'error',
    });

    throw err;
  }
}

// ─── Handler de Update ─────────────────────────────────────────────────────

export async function handleLexosOrderUpdate(
  payload: Record<string, unknown>,
): Promise<void> {
  const data = (payload.data ?? payload) as LexosPedido;

  const lexosOrderId  = s(data.pedido_id);
  const lexosOrderNum = s(data.numero_pedido);

  if (!lexosOrderId) throw new Error('[lexos-order-update] pedido_id ausente no payload');

  const existingOrder = await findWooOrderByShopifyIdGlobal(WOO_INSTANCE, lexosOrderId);
  if (!existingOrder) {
    console.warn(`[lexos-order-update] Pedido Lexos ${lexosOrderId} não encontrado no Woo — ignorando update`);
    await logOrder({
      shopify_order_id: lexosOrderId,
      shopify_order_name: lexosOrderNum,
      woo_instance: WOO_INSTANCE,
      origin: 'lexos',
      action: 'update_skipped_not_found',
      webhook: payload,
      status: 'skipped',
    });
    return;
  }

  const novoStatus = mapLexosStatus(data.status);

  // Evitar update se o status não mudou, reduzindo chamadas
  if (existingOrder.status === novoStatus) {
    console.info(`[lexos-order-update] Status do pedido ${lexosOrderId} inalterado (${novoStatus}) — ignorando update`);
    await logOrder({
      shopify_order_id: lexosOrderId,
      woo_order_id: existingOrder.id,
      woo_instance: WOO_INSTANCE,
      origin: 'lexos',
      action: 'update_skipped_unchanged',
      webhook: payload,
      status: 'skipped',
    });
    return;
  }

  const orderPayload = compactObject({
    status: novoStatus,
    // Se a Lexos mandar outros dados atualizados (ex: endereço corrigido),
    // poderíamos estender esse payload. Inicialmente focamos em status.
  });

  try {
    const updated = await updateOrder(WOO_INSTANCE, existingOrder.id, orderPayload);
    console.info(
      `[lexos-order-update] Pedido Lexos ${lexosOrderId} atualizado no Woo (id=${updated.id}) para status ${novoStatus}`,
    );
    await logOrder({
      shopify_order_id: lexosOrderId,
      shopify_order_name: lexosOrderNum,
      woo_order_id: updated.id,
      woo_instance: WOO_INSTANCE,
      origin: 'lexos',
      action: 'update',
      webhook: payload,
      payload: orderPayload,
      response: updated,
      status: 'success',
    });
  } catch (err: unknown) {
    const axErr = err instanceof AxiosError ? err : null;
    const details = axErr?.response?.data
      ? JSON.stringify(axErr.response.data)
      : (err as Error).message;

    await logError({
      flow: 'lexos-order-update',
      error_message: `Erro ao atualizar pedido no WooCommerce: ${details}`,
      payload: { lexosOrderId, orderPayload },
      entity_type: 'order',
      entity_id: lexosOrderId,
      stack: (err as Error).stack,
    });

    await logOrder({
      shopify_order_id: lexosOrderId,
      shopify_order_name: lexosOrderNum,
      origin: 'lexos',
      action: 'update_failed',
      payload: orderPayload,
      response: axErr?.response?.data ?? { error: (err as Error).message },
      status: 'error',
    });

    throw err;
  }
}
