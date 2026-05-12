import { s, compactObject, arrayOf, money } from '../../utils/helpers';
import { syncProductToLexos } from '../../services/lexos';
import { logError } from '../../services/logger';

// Tipagem básica das Variantes do Shopify para nos ajudar no mapping
interface ShopifyVariant {
  sku?: string;
  price?: string | number;
  compare_at_price?: string | number;
  inventory_quantity?: number;
  weight?: number;
  option1?: string;
  option2?: string;
  option3?: string;
}

interface ShopifyImage {
  src?: string;
}

interface ShopifyOption {
  name?: string;
  values?: string[];
}

/**
 * Mapeia um produto recebido via Webhook do Shopify
 * para o formato esperado pela API do Lexos Hub.
 */
export async function handleShopProductToLexos(payload: Record<string, unknown>): Promise<void> {
  const productId = String(payload?.id ?? '');
  const title = s(payload?.title);
  
  if (!productId) {
    throw new Error('[shop-product-to-lexos] id do produto é obrigatório');
  }

  console.info(`[shop-product-to-lexos] Processando produto Shopify ID ${productId}: ${title}`);

  try {
    const variants = arrayOf<ShopifyVariant>(payload?.variants);
    const images = arrayOf<ShopifyImage>(payload?.images);
    const options = arrayOf<ShopifyOption>(payload?.options);

    // Pegamos a primeira variante como principal para extrair Preço, Estoque e SKU base
    const mainVariant = variants[0] || {};
    
    const baseSku = s(mainVariant.sku) || productId;
    const basePrice = money(mainVariant.price);
    const promoPrice = mainVariant.compare_at_price ? money(mainVariant.compare_at_price) : undefined;
    const inventory = mainVariant.inventory_quantity || 0;
    const weight = mainVariant.weight || 0;

    // Converte imagens
    const imagensLexos = images.map((img, index) => ({
      url: s(img.src),
      principal: index === 0
    })).filter(img => img.url);

    // Converte variantes do Shopify para "atributos" no formato Lexos
    // Obs: Esta é uma abordagem conceitual baseada na documentação recebida.
    // Se a Lexos exigir um cadastro separado por SKU (variante) no futuro, 
    // a lógica precisará ser iterada por variante.
    const atributos: Array<{ nome: string; valor: string }> = [];
    
    // Se há variações reais (além da "Default Title")
    if (variants.length > 1 || (variants.length === 1 && s(variants[0].option1) !== 'Default Title')) {
      variants.forEach((v, index) => {
        if (v.option1 && options[0]?.name) atributos.push({ nome: `${options[0].name} (Var ${index+1})`, valor: s(v.option1) });
        if (v.option2 && options[1]?.name) atributos.push({ nome: `${options[1].name} (Var ${index+1})`, valor: s(v.option2) });
        if (v.option3 && options[2]?.name) atributos.push({ nome: `${options[2].name} (Var ${index+1})`, valor: s(v.option3) });
      });
    }

    // Payload no formato esperado pela Lexos API
    const lexosProductPayload = compactObject({
      sku: baseSku,
      nome: title,
      descricao: s(payload?.body_html),
      marca: s(payload?.vendor),
      categoria: s(payload?.product_type),
      preco_venda: basePrice,
      ...(promoPrice ? { preco_promocional: promoPrice } : {}),
      estoque: inventory,
      peso: weight,
      imagens: imagensLexos.length > 0 ? imagensLexos : undefined,
      atributos: atributos.length > 0 ? atributos : undefined,
    });

    await syncProductToLexos(lexosProductPayload);

  } catch (err: unknown) {
    const errorMsg = (err as Error).message;
    console.error(`[shop-product-to-lexos] Erro ao sincronizar produto ${productId}:`, errorMsg);
    
    await logError({
      flow: 'shop-product-to-lexos',
      error_message: `Falha ao montar/enviar payload para a Lexos: ${errorMsg}`,
      payload: { productId, payload },
      entity_type: 'product',
      entity_id: productId,
      stack: (err as Error).stack,
    });

    throw err;
  }
}
