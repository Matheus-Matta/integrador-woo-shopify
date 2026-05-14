import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAuth } from '@/lib/auth/dashboard';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';

// Payload de pedido teste no formato Lexos Hub
function buildTestPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const orderId = `TESTE-${Date.now()}`;
  return {
    event: 'pedido.criado',
    event_id: `evt-${Date.now()}`,
    pedido_id: orderId,
    numero_pedido: orderId,
    canal: 'shopify-test',
    status: 'novo',
    data_criacao: new Date().toISOString(),
    cliente: {
      nome: 'Cliente Teste Integração',
      documento: '00000000000',
      email: 'teste@integrador.local',
      telefone: '21999999999',
    },
    itens: [
      {
        sku: 'SKU-TESTE-001',
        nome: 'Produto Teste Integração',
        quantidade: 1,
        valor_unitario: 100.00,
      },
    ],
    entrega: {
      cep: '24400000',
      cidade: 'São Gonçalo',
      uf: 'RJ',
      endereco: 'Rua Teste',
      numero: '123',
      bairro: 'Centro',
      complemento: '',
      transportadora: 'Entrega Própria',
    },
    pagamento: {
      metodo: 'Cartão de Crédito',
      valor_total: 130.00,
      valor_frete: 30.00,
      valor_desconto: 0,
    },
    ...overrides,
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireDashboardAuth(request);
  if (auth) return auth;

  try {
    const body = await request.json().catch(() => ({}));
    
    // Permite sobrescrever o evento de teste (criado | atualizado)
    const eventType = (body?.event as string) || 'pedido.criado';
    const testPayload = buildTestPayload({ event: eventType, ...body });

    // Chama o webhook interno da Lexos diretamente (sem passar pela internet)
    const webhookUrl = `${config.domain}/api/webhooks/lexos`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Se houver token configurado, envia no header
    if (config.lexos.webhookToken) {
      headers['Authorization'] = config.lexos.webhookToken;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(testPayload),
    });

    const result = await response.json().catch(() => ({}));

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      webhookUrl,
      payloadEnviado: testPayload,
      respostaWebhook: result,
    });
  } catch (err) {
    console.error('[test-lexos-webhook] Erro:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
