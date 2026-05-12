import { logError } from './logger';

export interface LexosOrderStatusUpdate {
  pedidoId: string;
  status: string;
  rastreio?: string;
  // futuramente outros campos
}

/**
 * Atualiza o status do pedido na API do Lexos Hub.
 *
 * OBSERVAÇÃO: Esta função é atualmente um STUB.
 * A integração real exige fluxo OAuth2 (Authorization Code Grant)
 * com client_id/client_secret para obtenção de access_token e refresh_token.
 * Os endpoints exatos e payloads também dependem de validação no portal do desenvolvedor da Lexos.
 */
export async function updateLexosOrderStatus(
  updateData: LexosOrderStatusUpdate,
): Promise<void> {
  console.log(`[Lexos API] Solicitada atualização do pedido ${updateData.pedidoId} para status ${updateData.status}`);

  try {
    // 1. Obter/Renovar Token (Fluxo OAuth2 não implementado)
    // const token = await getValidLexosToken();

    // 2. Chamar endpoint da API Lexos
    // const response = await axios.put(`https://api.lexos.com.br/Pedidos/${updateData.pedidoId}/Status`, { status: updateData.status }, { headers: { Authorization: `Bearer ${token}` } });
    
    // Simulação de sucesso
    console.info(`[Lexos API] Status do pedido ${updateData.pedidoId} atualizado com sucesso na simulação.`);

  } catch (error) {
    console.error(`[Lexos API] Erro simulado ao atualizar pedido ${updateData.pedidoId}:`, error);
    await logError({
      flow: 'lexos-sync-inverso',
      error_message: 'Erro ao comunicar com API da Lexos (Stub)',
      payload: updateData,
      entity_type: 'order',
      entity_id: updateData.pedidoId,
    });
    // Não lançamos erro por enquanto para não travar o fluxo do WooCommerce
  }
}

/**
 * Envia um produto para a API da Lexos.
 *
 * OBSERVAÇÃO: Esta função é atualmente um STUB.
 */
export async function syncProductToLexos(
  productData: Record<string, unknown>,
): Promise<void> {
  const sku = productData.sku as string;
  console.log(`[Lexos API] Solicitada sincronização do produto SKU ${sku}`);

  try {
    // 1. Obter/Renovar Token (Fluxo OAuth2 não implementado)
    // const token = await getValidLexosToken();

    // 2. Chamar endpoint da API Lexos
    // const response = await axios.post(`https://api.lexos.com.br/Produtos`, productData, { headers: { Authorization: `Bearer ${token}` } });
    
    // Simulação de sucesso
    console.info(`[Lexos API] Produto SKU ${sku} sincronizado com sucesso na simulação.`);

  } catch (error) {
    console.error(`[Lexos API] Erro simulado ao sincronizar produto ${sku}:`, error);
    await logError({
      flow: 'lexos-product-sync',
      error_message: 'Erro ao comunicar com API da Lexos (Stub)',
      payload: productData,
      entity_type: 'product',
      entity_id: sku,
    });
    throw error;
  }
}
