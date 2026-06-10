type ShopifyVariant = {
  id?: string | number;
  sku?: string;
  price?: string | number;
  compare_at_price?: string | number | null;
  inventory_quantity?: number;
  option1?: string;
  option2?: string;
  option3?: string;
};

type ShopifyImage = {
  id?: string | number;
  src?: string;
  alt?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ShopifyProductLike = {
  id?: string | number;
  title?: string;
  handle?: string;
  body_html?: string;
  product_type?: string;
  vendor?: string;
  status?: string;
  variants?: ShopifyVariant[];
  images?: ShopifyImage[];
  created_at?: string;
  updated_at?: string;
};

function asPrice(value: string | number | null | undefined) {
  return value == null ? '' : String(value);
}

function asDate(value?: string) {
  return value ? value.replace(/\.\d+Z$/, '').replace('Z', '') : new Date().toISOString().replace(/\.\d+Z$/, '');
}

export function normalizeShopifyProductToWooProduct(shopifyProduct: ShopifyProductLike) {
  const variants = Array.isArray(shopifyProduct.variants) ? shopifyProduct.variants : [];
  const firstVariant = variants[0] || {};
  const regularPrice = asPrice(firstVariant.compare_at_price || firstVariant.price);
  const salePrice = firstVariant.compare_at_price ? asPrice(firstVariant.price) : '';
  const created = asDate(shopifyProduct.created_at);
  const modified = asDate(shopifyProduct.updated_at);

  return {
    name: shopifyProduct.title || '',
    slug: shopifyProduct.handle || '',
    date_created: created,
    date_created_gmt: created,
    date_modified: modified,
    date_modified_gmt: modified,
    type: variants.length > 1 ? 'variable' : 'simple',
    status: shopifyProduct.status === 'active' ? 'publish' : shopifyProduct.status || 'draft',
    featured: false,
    catalog_visibility: 'visible',
    description: shopifyProduct.body_html || '',
    short_description: '',
    sku: firstVariant.sku || '',
    price: asPrice(firstVariant.price),
    regular_price: regularPrice,
    sale_price: salePrice,
    on_sale: Boolean(firstVariant.compare_at_price),
    purchasable: true,
    total_sales: 0,
    virtual: false,
    downloadable: false,
    downloads: [],
    download_limit: -1,
    download_expiry: -1,
    tax_status: 'taxable',
    tax_class: '',
    manage_stock: typeof firstVariant.inventory_quantity === 'number',
    stock_quantity: firstVariant.inventory_quantity ?? null,
    stock_status: Number(firstVariant.inventory_quantity ?? 1) > 0 ? 'instock' : 'outofstock',
    backorders: 'no',
    backorders_allowed: false,
    backordered: false,
    sold_individually: false,
    weight: '',
    dimensions: { length: '', width: '', height: '' },
    shipping_required: true,
    shipping_taxable: true,
    shipping_class: '',
    shipping_class_id: 0,
    reviews_allowed: true,
    average_rating: '0.00',
    rating_count: 0,
    categories: shopifyProduct.product_type
      ? [{ id: 0, name: shopifyProduct.product_type, slug: String(shopifyProduct.product_type).toLowerCase().replace(/\s+/g, '-') }]
      : [],
    tags: [],
    images: (shopifyProduct.images || []).map((image, index) => ({
      id: Number(image.id || index + 1),
      date_created: asDate(image.created_at),
      date_created_gmt: asDate(image.created_at),
      date_modified: asDate(image.updated_at),
      date_modified_gmt: asDate(image.updated_at),
      src: image.src || '',
      name: image.src ? image.src.split('/').pop() || '' : '',
      alt: image.alt || '',
    })),
    attributes: [],
    default_attributes: [],
    variations: variants.map((variant) => Number(variant.id)).filter(Boolean),
    grouped_products: [],
    menu_order: 0,
    price_html: '',
    related_ids: [],
    meta_data: [
      { key: 'shopify_id', value: shopifyProduct.id ? String(shopifyProduct.id) : '' },
      { key: 'fabricante', value: shopifyProduct.vendor || '' },
      { key: 'shopify_variants', value: variants },
    ],
  };
}
