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

export function normalizeSearchText(v: unknown): string {
  return lower(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function hasMeaningfulValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as Record<string, unknown>).length > 0;
  return true;
}

export function compactObject<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = compactObject(value as Record<string, unknown>);
      if (hasMeaningfulValue(nested)) out[key] = nested;
      continue;
    }
    if (hasMeaningfulValue(value)) out[key] = value;
  }
  return out;
}

// ─── Serviços (EPOFW) ──────────────────────────────────────────────────────

export function hasServices(order: Record<string, unknown>): boolean {
  const lineItems = arrayOf<Record<string, unknown>>(order?.line_items);
  for (const item of lineItems) {
    const properties = arrayOf<{ name?: string; value?: string }>(item?.properties);
    for (const prop of properties) {
      const name = s(prop?.name);
      if (name && /^_?epofw_field_\d+$/.test(name)) {
        return true;
      }
    }
  }
  return false;
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
  const terms = (order?.payment_terms as Record<string, unknown>) ?? {};
  const paymentTexts = [
    ...arrayOf<string>(order?.payment_gateway_names),
    order?.gateway,
    order?.payment_method,
    order?.payment_method_title,
    order?.processing_method,
    terms?.payment_terms_name,
    terms?.payment_terms_type,
  ].map(normalizeSearchText).filter(Boolean);

  for (const attr of getNoteAttributes(order)) {
    const key = normalizeSearchText(attr?.name ?? attr?.key ?? '');
    if (/payment|pagamento|gateway|metodo|m[eé]todo/.test(key)) {
      paymentTexts.push(normalizeSearchText(attr?.value));
    }
  }

  return paymentTexts.some((text) =>
    text.includes('cash on delivery') ||
    text.includes('pagamento na entrega') ||
    text.includes('cartao na entrega') ||
    text.includes('cartao de credito na entrega') ||
    /\bcod\b/.test(text)
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
} | null {
  // A Shopify acrescenta novos gateways ao FINAL de `payment_gateway_names`
  // quando o cliente troca a forma de pagamento (ex.: cartão recusado → boleto/PIX).
  // O último item é sempre o método mais recente. `gateway` é usado como fallback
  // para pedidos onde o array não esteja presente.
  const terms = (order?.payment_terms as Record<string, unknown>) ?? {};
  const names = arrayOf<string>(order?.payment_gateway_names);
  const rawGateway = s(
    names[names.length - 1] ??
    order?.gateway ??
    order?.payment_method ??
    order?.payment_method_title ??
    terms?.payment_terms_name
  );
  if (!rawGateway) return null;
  const gatewayLower = lower(rawGateway);
  const payment_method = gatewayLower.startsWith('appmax_')
    ? gatewayLower.replace('appmax_', '')
    : gatewayLower;
  return { payment_method, payment_method_title: rawGateway };
}

// ─── EPOFW meta (serviços extras) ──────────────────────────────────────────

function parseExtraPrice(rawValue: unknown): number {
  const match = s(rawValue).match(/(?:\[|\()\s*\+?\s*R\$\s*([\d.,]+)\s*(?:\]|\))/i);
  if (!match) return 0;
  return parseLocalizedPrice(match[1]);
}

function isSelectedPaidService(rawValue: unknown, extraPrice: number): boolean {
  const value = s(rawValue);
  if (!value) return false;

  const normalized = normalizeSearchText(value);
  if (normalized === 'nao' || normalized === 'no' || normalized === 'false') return false;

  return extraPrice > 0;
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

function parseLocalizedPrice(v: unknown): number {
  // parseExtraPrice já retorna number. Convertê-lo novamente como texto e
  // remover os pontos transformava, por exemplo, 499.99 em 49999.
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;

  const raw = String(v ?? '').trim().replace(/[^\d,.-]/g, '');
  if (!raw) return 0;

  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let normalized = raw;

  if (lastComma >= 0 && lastDot >= 0) {
    // O último separador é o decimal; os anteriores são de milhar.
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? /\./g : /,/g;
    normalized = raw.replace(thousandsSeparator, '').replace(decimalSeparator, '.');
  } else if (lastComma >= 0) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPriceValue(v: unknown): string {
  // O EPOFW espera o valor monetário com ponto decimal. Arredondar aqui
  // alterava 499,99 para 500 e fazia o plugin aplicar um preço incorreto.
  return parseLocalizedPrice(v).toFixed(2);
}

function formatPriceDisplay(v: unknown): string {
  return parseLocalizedPrice(v).toFixed(2).replace('.', ',');
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
interface LineItem { sku?: string; product_id?: string; quantity?: number; price?: unknown; properties?: ItemProp[]; total_discount?: unknown; discount_allocations?: unknown[] }

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
  const extraPrice = parseExtraPrice(rawValue) || parseExtraPrice(rawName);
  if (!isSelectedPaidService(rawValue, extraPrice)) return null;
  const priceValue = formatPriceValue(extraPrice);
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
        epofw_price: priceValue,
        epofw_original_price: priceValue,
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
  const result: Record<string, unknown>[] = [];
  for (const item of arrayOf<LineItem>(order?.line_items)) {
    const quantity = Number(item?.quantity ?? 1) || 1;
    const unitPrice = Number(String(item?.price).replace(',', '.')) || 0;

    // Desconto total do item (direto + allocations de cupom)
    const lineDiscount = Number(item?.total_discount ?? 0) || 0;
    const allocs = arrayOf<{ amount?: string }>(item?.discount_allocations);
    const allocDiscount = allocs.reduce((acc, a) => acc + (Number(a.amount) || 0), 0);
    const totalDiscount = lineDiscount + allocDiscount;

    const name = s((item as Record<string, unknown>)?.title ?? item?.sku ?? '');
    const sku = s(item?.sku);
    const metaData = arrayOf<ItemProp>(item?.properties)
      .map((prop) => buildEpofwMeta(prop, item))
      .filter(Boolean);

    // Explode: 1 linha por unidade (qty=1)
    const perUnitTotal = ((unitPrice * quantity) - totalDiscount) / quantity;
    for (let i = 0; i < quantity; i++) {
      result.push({ name, sku, quantity: 1, total: money(perUnitTotal), meta_data: metaData });
    }
  }
  return result;
}

/**
 * Variante usada quando vamos aplicar `coupon_lines` no pedido.
 * Evita descontar novamente as alocações de cupom por item (allocations),
 * deixando o WooCommerce calcular o rateio do desconto do cupom.
 */
export function buildLineItemsForCoupons(order: Record<string, unknown>): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  for (const item of arrayOf<LineItem>(order?.line_items)) {
    const quantity = Number(item?.quantity ?? 1) || 1;
    const unitPrice = Number(String(item?.price).replace(',', '.')) || 0;

    // Apenas descontos diretos do item; ignora allocations de cupom
    const lineDiscount = Number(item?.total_discount ?? 0) || 0;

    const name = s((item as Record<string, unknown>)?.title ?? item?.sku ?? '');
    const sku = s(item?.sku);
    const metaData = arrayOf<ItemProp>(item?.properties)
      .map((prop) => buildEpofwMeta(prop, item))
      .filter(Boolean);

    const perUnitTotal = ((unitPrice * quantity) - lineDiscount) / quantity;
    for (let i = 0; i < quantity; i++) {
      result.push({ name, sku, quantity: 1, total: money(perUnitTotal), meta_data: metaData });
    }
  }
  return result;
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
    const perUnitTotal = ((unitPrice * quantity) - totalDiscount) / quantity;

    const name = s((item as Record<string, unknown>)?.title ?? item?.sku ?? '');
    const metaData = arrayOf<ItemProp>(item?.properties)
      .map((prop) => buildEpofwMeta(prop, item))
      .filter(Boolean);

    // Para cada unidade no Shopify, tentamos encontrar um item correspondente ainda não usado no Woo
    for (let i = 0; i < quantity; i++) {
      const wooMatch = existingWooItems.find((w) => {
        if (usedWooIds.has(w.id)) return false;
        const wSku = s(w.sku).toLowerCase();
        const wName = s(w.name).toLowerCase();
        return (sku && wSku === sku) || wName === name.toLowerCase();
      });

      if (wooMatch) {
        usedWooIds.add(wooMatch.id);
        result.push({ id: wooMatch.id, name, sku: s(item?.sku), quantity: 1, total: money(perUnitTotal), meta_data: metaData });
      } else {
        // Sem match disponível: cria novo item (qty=1)
        result.push({ name, sku: s(item?.sku), quantity: 1, total: money(perUnitTotal), meta_data: metaData });
      }
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
    const perUnitTotal = ((unitPrice * quantity) - lineDiscount) / quantity;

    const name = s((item as Record<string, unknown>)?.title ?? item?.sku ?? '');
    const metaData = arrayOf<ItemProp>(item?.properties)
      .map((prop) => buildEpofwMeta(prop, item))
      .filter(Boolean);

    for (let i = 0; i < quantity; i++) {
      const wooMatch = existingWooItems.find((w) => {
        if (usedWooIds.has(w.id)) return false;
        const wSku = s(w.sku).toLowerCase();
        const wName = s(w.name).toLowerCase();
        return (sku && wSku === sku) || wName === name.toLowerCase();
      });

      if (wooMatch) {
        usedWooIds.add(wooMatch.id);
        result.push({ id: wooMatch.id, name, sku: s(item?.sku), quantity: 1, total: money(perUnitTotal), meta_data: metaData });
      } else {
        result.push({ name, sku: s(item?.sku), quantity: 1, total: money(perUnitTotal), meta_data: metaData });
      }
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

function shippingLineTitle(line: ShopifyShippingLine): string {
  return s(line.title ?? line.code);
}

function shippingLineAmount(line: ShopifyShippingLine, fallback?: unknown): string {
  const raw = line.price ?? line.price_set?.shop_money?.amount ?? fallback;
  return hasMeaningfulValue(raw) ? money(raw) : '';
}

export function buildShippingLines(
  order: Record<string, unknown>,
  existingWooLines?: WooShippingLine[],
): Record<string, unknown>[] {
  const shopLines = arrayOf<ShopifyShippingLine>(order?.shipping_lines);
  const totalShip = (order?.total_shipping_price_set as { shop_money?: { amount?: string } })?.shop_money?.amount;

  if (existingWooLines && existingWooLines.length > 0) {
    const maxLen = Math.max(existingWooLines.length, shopLines.length);
    const lines: Record<string, unknown>[] = [];
    for (let i = 0; i < maxLen; i++) {
      const wooLine = existingWooLines[i];
      const shopLine = shopLines[i];
      if (wooLine && shopLine) {
        const title = shippingLineTitle(shopLine);
        const price = shippingLineAmount(shopLine, totalShip);
        lines.push(compactObject({
          id: wooLine.id,
          method_id: s(shopLine.code ?? wooLine.method_id),
          method_title: title && price ? `${title} (R$ ${price})` : title || s(wooLine.method_title),
          total: price,
          total_tax: hasMeaningfulValue(wooLine.total_tax) ? money(wooLine.total_tax) : undefined,
          taxes: arrayOf(wooLine.taxes),
        }));
      } else if (wooLine) {
        lines.push(compactObject({
          id: wooLine.id,
          method_id: s(wooLine.method_id),
          method_title: s(wooLine.method_title),
          total: hasMeaningfulValue(wooLine.total) ? money(wooLine.total) : undefined,
          total_tax: hasMeaningfulValue(wooLine.total_tax) ? money(wooLine.total_tax) : undefined,
          taxes: arrayOf(wooLine.taxes),
        }));
      } else if (shopLine) {
        const title = shippingLineTitle(shopLine);
        const price = shippingLineAmount(shopLine, totalShip);
        lines.push(compactObject({
          method_id: s(shopLine.code),
          method_title: title && price ? `${title} (R$ ${price})` : title,
          total: price,
        }));
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
    const title = shippingLineTitle(line);
    const total = shippingLineAmount(line, totalShip);
    return compactObject({
      method_id: s(line.code),
      method_title: title && total ? `${title} (R$ ${total})` : title,
      total,
    });
  }).filter((line) => hasMeaningfulValue(line));
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
