// Portado dos nós Code/JavaScript do fluxo n8n

// ─── Primitivos ────────────────────────────────────────────────────────────

export function s(v: unknown): string {
  if (Array.isArray(v)) return v.join(' ').toString().trim();
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '') // remove Zero Width chars
    .trim();
}

export function digits(v: unknown): string {
  return s(v).replace(/\D/g, '');
}

export function money(v: unknown): string {
  const n = Number(String(v).replace(',', '.')) || 0;
  return n.toFixed(2);
}

export function arrayOf<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function lower(v: unknown): string {
  return s(v).toLowerCase();
}

// ─── Endereço ──────────────────────────────────────────────────────────────

export function normalizeAddressText(v: unknown): string {
  return s(v).replace(/\s+/g, ' ').trim();
}

export function extractNumberFromAddress1(address1: unknown): string {
  const txt = normalizeAddressText(address1);
  if (!txt) return '';
  const parts = txt.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    const match = last.match(/\d+[A-Za-z0-9\-/]*/);
    if (match) return match[0];
  }
  const match = txt.match(/(\d+[A-Za-z0-9\-/]*)\s*$/);
  return match ? match[1] : '';
}

export function extractNeighborhoodFromAddress2(address2: unknown): string {
  const txt = normalizeAddressText(address2);
  if (!txt) return '';
  const parts = txt.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : txt;
}

interface NoteAttr { name?: string; key?: string; value?: string }

export function getNoteAttributes(order: Record<string, unknown>): NoteAttr[] {
  return arrayOf<NoteAttr>(order?.note_attributes);
}

export function findAttrValue(attrs: NoteAttr[], candidates: string[]): string {
  const norm = candidates.map(lower);
  for (const a of attrs) {
    const k = lower(a?.name ?? a?.key ?? '');
    if (norm.includes(k) && s(a?.value)) return s(a.value);
  }
  return '';
}

export function findAttrByRegex(attrs: NoteAttr[], regex: RegExp): string {
  for (const a of attrs) {
    if (regex.test(s(a?.name ?? a?.key ?? '')) && s(a?.value)) return s(a.value);
  }
  return '';
}

export function getCpfFromShopify(order: Record<string, unknown>): string {
  const attrs = getNoteAttributes(order);
  const exact = findAttrValue(attrs, ['customer_document', 'cpf', 'billing_cpf', 'document']);
  if (exact) return exact;
  return findAttrByRegex(attrs, /cpf|document/i);
}

export function getNumberFromShopify(
  order: Record<string, unknown>,
  address?: Record<string, unknown>,
): string {
  const attrs = getNoteAttributes(order);
  const exact = findAttrValue(attrs, ['numero', 'number', 'billing_number', 'shipping_number']);
  if (exact) return exact;
  const addr = address ?? (order?.shipping_address as Record<string, unknown>) ?? {};
  return s(addr?.number) || extractNumberFromAddress1(addr?.address1);
}

export function getNeighborhoodFromShopify(
  order: Record<string, unknown>,
  address?: Record<string, unknown>,
): string {
  const attrs = getNoteAttributes(order);
  const exact = findAttrValue(attrs, [
    'bairro', 'neighborhood', 'billing_neighborhood', 'shipping_neighborhood',
  ]);
  if (exact) return exact;
  const addr = address ?? (order?.shipping_address as Record<string, unknown>) ?? {};
  return s(addr?.neighborhood) || extractNeighborhoodFromAddress2(addr?.address2);
}

export function getDeliveryDateFromShopify(order: Record<string, unknown>): string {
  return findAttrValue(getNoteAttributes(order), [
    'Agendamento', 'agendamento', 'delivery_date', 'delivery date', 'data_entrega', 'data de entrega',
  ]);
}

export function getDeliveryTypeFromShopify(order: Record<string, unknown>): string {
  const exact = findAttrValue(getNoteAttributes(order), [
    'delivery_type', 'tipo_entrega', 'tipo de entrega', 'shipping_type',
  ]);
  if (exact) return lower(exact);
  const line = arrayOf<Record<string, unknown>>(order?.shipping_lines)[0] ?? {};
  const title = lower(line?.title ?? line?.code ?? '');
  if (title.includes('pickup') || title.includes('retirada')) return 'pickup';
  if (title.includes('delivery') || title.includes('entrega')) return 'delivery';
  if (arrayOf(order?.shipping_lines).length) return 'delivery';
  return '';
}

// ─── Status ────────────────────────────────────────────────────────────────

export function isCashOnDelivery(order: Record<string, unknown>): boolean {
  const gateways = arrayOf<string>(order?.payment_gateway_names).map(lower);
  return gateways.some(
    (g) => g.includes('cash on delivery') || g === 'cod' || g.includes('pagamento na entrega'),
  );
}

export function mapStatus(order: Record<string, unknown>): string {
  const financial = lower(order?.financial_status);
  if (order?.cancelled_at) return 'cancelled';
  if (financial === 'refunded') return 'refunded';
  if (['voided', 'cancelled', 'canceled'].includes(financial)) return 'cancelled';
  if (isCashOnDelivery(order)) return 'processing';
  if (['paid', 'partially_paid'].includes(financial)) return 'processing';
  if (['pending', 'authorized'].includes(financial)) return 'pending';
  return 'pending';
}

// ─── Pagamento ─────────────────────────────────────────────────────────────

export function getPaymentData(order: Record<string, unknown>): {
  payment_method: string;
  payment_method_title: string;
} {
  // A Shopify acrescenta novos gateways ao FINAL de `payment_gateway_names`
  // quando o cliente troca a forma de pagamento (ex.: cartão recusado → boleto/PIX).
  // O último item é sempre o método mais recente. `gateway` é usado como fallback
  // para pedidos onde o array não esteja presente.
  const names = arrayOf<string>(order?.payment_gateway_names);
  const rawGateway = s(
    names[names.length - 1] ?? order?.gateway ?? 'manual',
  );
  const gatewayLower = lower(rawGateway);
  const payment_method = gatewayLower.startsWith('appmax_')
    ? gatewayLower.replace('appmax_', '')
    : gatewayLower;
  return { payment_method, payment_method_title: rawGateway };
}

// ─── EPOFW meta (serviços extras) ──────────────────────────────────────────

function parseExtraPrice(rawValue: unknown): number {
  const match = s(rawValue).match(/\[\s*\+?\s*R\$\s*([\d.,]+)\s*\]/i);
  if (!match) return 0;
  const parsed = Number(match[1].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLabelTitle(rawName: string): string {
  const cleaned = s(rawName).replace(/^_+/, '');
  const parts = cleaned.split('_').filter(Boolean);
  const base = parts.length > 1 ? parts.slice(0, -1).join('_') : cleaned;
  return base.replace(/_/g, ' ').trim().toUpperCase();
}

function extractServiceId(rawName: string): string {
  const cleaned = s(rawName).replace(/^_+/, '');
  const parts = cleaned.split('_').filter(Boolean);
  const maybeId = parts[parts.length - 1] ?? '';
  return /^\d+$/.test(maybeId) ? maybeId : '';
}

function formatPriceIntegerString(v: unknown): string {
  const n = Number(String(v).replace(/\./g, '').replace(',', '.')) || 0;
  return String(Math.round(n));
}

function formatPriceDisplay(v: unknown): string {
  const n = Number(String(v).replace(/\./g, '').replace(',', '.')) || 0;
  return n.toFixed(2).replace('.', ',');
}

function normalizeServiceLabel(rawName: string): string {
  const label = normalizeLabelTitle(rawName);
  const knownLabels = [
    { test: /imper/i, value: 'IMPERMEABILIZAÇÃO DA POLTRONA:' },
    { test: /montagem/i, value: 'MONTAGEM:' },
    { test: /garantia/i, value: 'GARANTIA ESTENDIDA:' },
  ];
  const matched = knownLabels.find((item) => item.test.test(label));
  return matched ? matched.value : label;
}

interface ItemProp { name?: string; value?: string }
interface LineItem { sku?: string; product_id?: string; quantity?: number; price?: unknown; properties?: ItemProp[] }

export function buildEpofwMeta(
  prop: ItemProp,
  item: LineItem,
): Record<string, unknown> | null {
  const rawName = s(prop?.name);
  const rawValue = s(prop?.value);
  if (!rawName || rawName === '_tpo_add_by') return null;
  const serviceId = extractServiceId(rawName);
  if (!serviceId) return null;

  const fieldKey = `epofw_field_${serviceId}`;
  const productId = s(item?.product_id ?? item?.sku ?? '');
  const extraPrice = parseExtraPrice(rawValue);
  const priceInt = formatPriceIntegerString(extraPrice);
  const priceDisplay = formatPriceDisplay(extraPrice);
  const labelTitle = normalizeServiceLabel(rawName);
  const labelClass = `epofw_label_${serviceId}`;

  return {
    key: fieldKey,
    value: JSON.stringify({
      [fieldKey]: {
        epofw_field_quantity: '1',
        epofw_label: labelTitle,
        product_id: productId,
        epofw_type: 'radiogroup',
        epofw_name: fieldKey,
        epofw_value: 'Sim',
        epofw_price: priceInt,
        epofw_original_price: priceInt,
        epofw_price_type: 'fixed',
        epofw_form_data: {
          field_status: 'on',
          field: { type: 'radiogroup', name: serviceId, id: serviceId, class: serviceId },
          label: { title: labelTitle, class: labelClass, subtitle: '', subtitle_class: '' },
          epofw_field_settings: {
            options: {
              Sim: `Sim||fixed||${priceDisplay}`,
              Não: 'Não||fixed||0,00',
            },
          },
        },
      },
    }),
  };
}

export interface WooLineItem {
  id: number;
  name: string;
  sku: string;
  quantity: number;
  total: string;
  meta_data?: { key: string; value: unknown }[];
}

export function buildLineItems(order: Record<string, unknown>): Record<string, unknown>[] {
  return arrayOf<LineItem>(order?.line_items).map((item) => {
    const quantity = Number(item?.quantity ?? 1) || 1;
    const unitPrice = Number(String(item?.price).replace(',', '.')) || 0;
    
    // Calcula desconto total do item (descontos diretos + alocações de cupons do pedido)
    const lineDiscount = Number(item?.total_discount ?? 0) || 0;
    const allocs = arrayOf<{ amount?: string }>(item?.discount_allocations);
    const allocDiscount = allocs.reduce((acc, a) => acc + (Number(a.amount) || 0), 0);
    const totalDiscount = lineDiscount + allocDiscount;

    return {
      name: s((item as Record<string, unknown>)?.title ?? item?.sku ?? ''),
      sku: s(item?.sku),
      quantity,
      total: money((unitPrice * quantity) - totalDiscount),
      meta_data: arrayOf<ItemProp>(item?.properties)
        .map((prop) => buildEpofwMeta(prop, item))
        .filter(Boolean),
    };
  });
}

/**
 * Variante usada quando vamos aplicar `coupon_lines` no pedido.
 * Evita descontar novamente as alocações de cupom por item (allocations),
 * deixando o WooCommerce calcular o rateio do desconto do cupom.
 */
export function buildLineItemsForCoupons(order: Record<string, unknown>): Record<string, unknown>[] {
  return arrayOf<LineItem>(order?.line_items).map((item) => {
    const quantity = Number(item?.quantity ?? 1) || 1;
    const unitPrice = Number(String(item?.price).replace(',', '.')) || 0;

    // Desconta apenas descontos diretos do item; ignora allocations de cupom
    const lineDiscount = Number(item?.total_discount ?? 0) || 0;

    return {
      name: s((item as Record<string, unknown>)?.title ?? item?.sku ?? ''),
      sku: s(item?.sku),
      quantity,
      total: money((unitPrice * quantity) - lineDiscount),
      meta_data: arrayOf<ItemProp>(item?.properties)
        .map((prop) => buildEpofwMeta(prop, item))
        .filter(Boolean),
    };
  });
}

/**
 * Mescla itens do pedido Shopify com itens existentes no WooCommerce.
 *
 * Estratégia (evita duplicação no PUT /orders/{id}):
 * - Shopify item com SKU que JÁ EXISTE no Woo → atualiza (inclui o `id` woo)
 * - Shopify item com SKU NOVO → cria (sem `id`)
 * - Item Woo sem correspondência no Shopify → preserva tal como está (inclui `id` + valores atuais)
 *
 * O WooCommerce trata line_items no PUT assim:
 *   { id } → atualiza o item existente
 *   sem id → cria novo item
 * Portanto itens existentes passados com seu `id` nunca são duplicados.
 */
export function mergeLineItems(
  order: Record<string, unknown>,
  existingWooItems: WooLineItem[],
): Record<string, unknown>[] {
  const shopifyItems = arrayOf<LineItem>(order?.line_items);
  const usedWooIds = new Set<number>();
  const result: Record<string, unknown>[] = [];

  for (const item of shopifyItems) {
    const sku = s(item?.sku).toLowerCase();
    const quantity = Number(item?.quantity ?? 1) || 1;
    const unitPrice = Number(String(item?.price).replace(',', '.')) || 0;
    
    const lineDiscount = Number(item?.total_discount ?? 0) || 0;
    const allocs = arrayOf<{ amount?: string }>(item?.discount_allocations);
    const allocDiscount = allocs.reduce((acc, a) => acc + (Number(a.amount) || 0), 0);
    const totalDiscount = lineDiscount + allocDiscount;
    const total = money((unitPrice * quantity) - totalDiscount);

    const name = s((item as Record<string, unknown>)?.title ?? item?.sku ?? '');
    const metaData = arrayOf<ItemProp>(item?.properties)
      .map((prop) => buildEpofwMeta(prop, item))
      .filter(Boolean);

    // Tenta casar pelo SKU (prioritário), depois pelo nome
    const wooMatch =
      (sku ? existingWooItems.find((w) => w.sku.toLowerCase() === sku) : null) ??
      existingWooItems.find((w) => w.name.toLowerCase() === name.toLowerCase());

    if (wooMatch && !usedWooIds.has(wooMatch.id)) {
      // Atualiza item existente: preserva o id → Woo não cria duplicata
      usedWooIds.add(wooMatch.id);
      result.push({ id: wooMatch.id, name, sku: s(item?.sku), quantity, total, meta_data: metaData });
    } else {
      // Item novo no Shopify que não existe no Woo: cria
      result.push({ name, sku: s(item?.sku), quantity, total, meta_data: metaData });
    }
  }

  // Itens do Woo que não têm mais correspondência no Shopify:
  // preserva-os com seus valores atuais para não os excluir acidentalmente
  for (const wooItem of existingWooItems) {
    if (!usedWooIds.has(wooItem.id)) {
      result.push({
        id: wooItem.id,
        name: wooItem.name,
        sku: wooItem.sku,
        quantity: wooItem.quantity,
        total: wooItem.total,
        meta_data: wooItem.meta_data ?? [],
      });
    }
  }

  return result;
}

/**
 * Variante de mesclagem quando vamos aplicar `coupon_lines`.
 * Recalcula os totais descontando apenas descontos diretos do item,
 * deixando o cupom do Woo ajustar o desconto globalmente.
 */
export function mergeLineItemsForCoupons(
  order: Record<string, unknown>,
  existingWooItems: WooLineItem[],
): Record<string, unknown>[] {
  const shopifyItems = arrayOf<LineItem>(order?.line_items);
  const usedWooIds = new Set<number>();
  const result: Record<string, unknown>[] = [];

  for (const item of shopifyItems) {
    const sku = s(item?.sku).toLowerCase();
    const quantity = Number(item?.quantity ?? 1) || 1;
    const unitPrice = Number(String(item?.price).replace(',', '.')) || 0;

    // Apenas desconto direto do item; ignora allocations de cupom
    const lineDiscount = Number(item?.total_discount ?? 0) || 0;
    const total = money((unitPrice * quantity) - lineDiscount);

    const name = s((item as Record<string, unknown>)?.title ?? item?.sku ?? '');
    const metaData = arrayOf<ItemProp>(item?.properties)
      .map((prop) => buildEpofwMeta(prop, item))
      .filter(Boolean);

    const wooMatch =
      (sku ? existingWooItems.find((w) => w.sku.toLowerCase() === sku) : null) ??
      existingWooItems.find((w) => w.name.toLowerCase() === name.toLowerCase());

    if (wooMatch && !usedWooIds.has(wooMatch.id)) {
      usedWooIds.add(wooMatch.id);
      result.push({ id: wooMatch.id, name, sku: s(item?.sku), quantity, total, meta_data: metaData });
    } else {
      result.push({ name, sku: s(item?.sku), quantity, total, meta_data: metaData });
    }
  }

  for (const wooItem of existingWooItems) {
    if (!usedWooIds.has(wooItem.id)) {
      result.push({
        id: wooItem.id,
        name: wooItem.name,
        sku: wooItem.sku,
        quantity: wooItem.quantity,
        total: wooItem.total,
        meta_data: wooItem.meta_data ?? [],
      });
    }
  }

  return result;
}

// ─── Shipping lines ────────────────────────────────────────────────────────

interface WooShippingLine {
  id?: number;
  method_id?: string;
  method_title?: string;
  total?: string;
  total_tax?: string;
  taxes?: unknown[];
}

interface ShopifyShippingLine {
  title?: string;
  code?: string;
  price?: string;
  price_set?: { shop_money?: { amount: string } };
}

export function buildShippingLines(
  order: Record<string, unknown>,
  existingWooLines?: WooShippingLine[],
): Record<string, unknown>[] {
  const shopLines = arrayOf<ShopifyShippingLine>(order?.shipping_lines);
  const totalShip = s(
    (order?.total_shipping_price_set as Record<string, unknown>)?.shop_money,
  );

  if (existingWooLines && existingWooLines.length > 0) {
    const maxLen = Math.max(existingWooLines.length, shopLines.length);
    const lines: Record<string, unknown>[] = [];
    for (let i = 0; i < maxLen; i++) {
      const wooLine = existingWooLines[i];
      const shopLine = shopLines[i];
      if (wooLine && shopLine) {
        const title = s(shopLine.title ?? 'Frete');
        const price = money(
          shopLine.price ??
          shopLine.price_set?.shop_money?.amount ??
          totalShip ??
          '0',
        );
        lines.push({
          id: wooLine.id,
          method_id: 'maxxxmoveis',
          method_title: `${title} (R$ ${price})`,
          total: price,
          total_tax: money(wooLine.total_tax ?? 0),
          taxes: arrayOf(wooLine.taxes),
        });
      } else if (wooLine) {
        lines.push({
          id: wooLine.id,
          method_id: 'maxxxmoveis',
          method_title: s(wooLine.method_title ?? 'Frete (R$ 0.00)'),
          total: money(wooLine.total ?? '0'),
          total_tax: '0.00',
          taxes: [],
        });
      } else if (shopLine) {
        const title = s(shopLine.title ?? 'Frete');
        const price = money(
          shopLine.price ??
          shopLine.price_set?.shop_money?.amount ??
          totalShip ??
          '0',
        );
        lines.push({
          method_id: 'maxxxmoveis',
          method_title: `${title} (R$ ${price})`,
          total: price,
          total_tax: '0.00',
          taxes: [],
        });
      }
    }
    // Evita duplicação de frete quando houver divergência entre linhas de frete existentes
    // no WooCommerce e linhas de frete vindas do Shopify. Se existirem mais linhas no Woo
    // do que as enviadas pelo Shopify, remove duplicatas com o mesmo título/valor.
    if (existingWooLines.length > shopLines.length) {
      const deduped: Record<string, unknown>[] = [];
      const seen = new Set<string>();
      for (const l of lines) {
        const key = `${l['method_title']}-${l['total']}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(l);
        }
      }
      return deduped;
    }
    return lines;
  }

  return shopLines.map((line) => {
    const title = s(line.title ?? line.code ?? 'Frete');
    const total = money(
      line.price ??
      line.price_set?.shop_money?.amount ??
      totalShip ??
      '0',
    );
    return {
      method_id: 'maxxxmoveis',
      method_title: `${title} (R$ ${total})`,
      total,
    };
  });
}

export function buildCoupons(_order: Record<string, unknown>): { code: string }[] {
  // Retornamos vazio para evitar erro 400 no WooCommerce caso o cupom não exista lá.
  // O valor total já foi ajustado nos line_items subtraindo o desconto.
  return [];
}

// ─── WooCommerce customer meta ─────────────────────────────────────────────

interface WooMeta { key: string; value: unknown }

export function getWooMetaValue(
  meta: WooMeta[],
  candidates: string[],
  fallbackRegex?: RegExp,
): string {
  const norm = candidates.map(lower);
  for (const m of arrayOf<WooMeta>(meta)) {
    if (norm.includes(lower(m.key)) && s(m.value)) return s(m.value);
  }
  if (fallbackRegex) {
    for (const m of arrayOf<WooMeta>(meta)) {
      if (fallbackRegex.test(m.key) && s(m.value)) return s(m.value);
    }
  }
  return '';
}
