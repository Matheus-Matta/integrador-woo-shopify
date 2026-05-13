# Documentação — Cadastro de Webhook na Lexos Hub API

## 1. Objetivo

Esta documentação explica como cadastrar, consultar, testar e remover uma URL de webhook na **Lexos Hub API**.

A API de webhook da Lexos permite configurar uma URL externa que será chamada automaticamente quando determinados eventos acontecerem dentro do Lexos Hub.

---

## 2. Visão geral do fluxo

```text
Lexos Hub
   ↓ evento interno
Webhook Lexos
   ↓ requisição POST
Sua API / Endpoint
   ↓ processamento interno
Seu sistema, ERP, banco de dados, integração, n8n etc.
```

Exemplo:

```text
Pedido criado na Lexos
   ↓
Lexos envia POST para https://meusistema.com.br/webhook/lexos
   ↓
Sua API recebe o pedido
   ↓
Seu sistema registra, processa ou integra o pedido
```

---

## 3. Atenção importante

A documentação de webhook da Lexos informa eventos relacionados a **pedidos e notas fiscais**.

Eventos disponíveis:

| Evento | Descrição |
|---|---|
| `Pedido` | Criação de um pedido |
| `EstornoPedido` | Estorno do pedido |
| `DevolucaoPedido` | Devolução do pedido |
| `EmissaoNotaFiscal` | Nota fiscal emitida |
| `CancelamentoNotaFiscal` | Nota fiscal cancelada |
| `DevolucaoNotaFiscal` | Nota fiscal devolvida |
| `EstornoNotaFiscal` | Nota fiscal estornada |

> Importante: esta API de webhook da Lexos não lista eventos de criação ou atualização de produto.  
> Para produto criado/atualizado no Shopify, o fluxo recomendado continua sendo:
>
> ```text
> Shopify Webhook products/create ou products/update
>      ↓
> Sua API intermediária
>      ↓
> Lexos Hub API de produto
> ```

---

## 4. Base URL

```http
https://api.lexos.com.br
```

---

## 5. Autenticação

Todas as chamadas para a API de webhook exigem dois headers:

| Header | Obrigatório | Descrição |
|---|---:|---|
| `Authorization` | Sim | JWT Bearer Token obtido no processo de autenticação |
| `Chave` | Sim | Chave da integração no Lexos Hub |

Formato esperado:

```http
Authorization: Bearer SEU_TOKEN_JWT
Chave: SUA_CHAVE_DA_INTEGRACAO
```

---

## 6. Cadastrar webhook

### Endpoint

```http
POST https://api.lexos.com.br/webhook/Cadastrar
```

### Descrição

Utilize esta API para cadastrar uma URL como webhook para o recebimento de pedidos e eventos da Lexos.

### Headers

```http
Authorization: Bearer SEU_TOKEN_JWT
Chave: SUA_CHAVE_DA_INTEGRACAO
Content-Type: application/json
```

### Body

```json
{
  "WebhookUrl": "https://meu-endereco.com/webhook"
}
```

### Campo do body

| Campo | Obrigatório | Tipo | Descrição |
|---|---:|---|---|
| `WebhookUrl` | Sim | string | URL que será invocada pelo webhook |

### Exemplo com cURL

```bash
curl -X POST "https://api.lexos.com.br/webhook/Cadastrar" \
  -H "Authorization: Bearer SEU_TOKEN_JWT" \
  -H "Chave: SUA_CHAVE_DA_INTEGRACAO" \
  -H "Content-Type: application/json" \
  -d '{
    "WebhookUrl": "https://meusistema.com.br/webhooks/lexos"
  }'
```

### Respostas possíveis

| Status | Significado |
|---:|---|
| `201 Created` | Webhook cadastrado com sucesso |
| `400 Bad Request` | Erro de validação nos objetos ou parâmetros informados |
| `404 Not Found` | Nenhum anúncio encontrado de acordo com os parâmetros fornecidos |

---

## 7. Obter webhook cadastrado

### Endpoint

```http
GET https://api.lexos.com.br/webhook/Obter
```

### Descrição

Retorna a URL de webhook atualmente cadastrada na integração.

### Headers

```http
Authorization: Bearer SEU_TOKEN_JWT
Chave: SUA_CHAVE_DA_INTEGRACAO
```

### Exemplo com cURL

```bash
curl -X GET "https://api.lexos.com.br/webhook/Obter" \
  -H "Authorization: Bearer SEU_TOKEN_JWT" \
  -H "Chave: SUA_CHAVE_DA_INTEGRACAO"
```

### Resposta 200 OK

```json
{
  "WebhookUrl": "https://meu-endereco.com/webhook"
}
```

### Respostas possíveis

| Status | Significado |
|---:|---|
| `200 OK` | Webhook encontrado com sucesso |
| `400 Bad Request` | Erro de validação nos objetos ou parâmetros informados |
| `404 Not Found` | Nenhum anúncio encontrado de acordo com os parâmetros fornecidos |

---

## 8. Testar webhook

### Endpoint

```http
POST https://api.lexos.com.br/webhook/Testar
```

Também é possível informar o tipo de webhook via query string:

```http
POST https://api.lexos.com.br/webhook/Testar?TipoWebhook=Pedido
```

### Descrição

Ao invocar esta API, a Lexos enviará uma requisição `POST` para a URL cadastrada, simulando o recebimento de um pedido ou outro evento.

Caso nenhum parâmetro seja informado, será disparado um webhook do tipo:

```text
Pedido
```

### Parâmetro de query

| Parâmetro | Obrigatório | Tipo | Descrição |
|---|---:|---|---|
| `TipoWebhook` | Não | string | Tipo de webhook a ser disparado |

Valores aceitos:

```text
Pedido
EstornoPedido
DevolucaoPedido
EmissaoNotaFiscal
CancelamentoNotaFiscal
DevolucaoNotaFiscal
EstornoNotaFiscal
```

### Headers

```http
Authorization: Bearer SEU_TOKEN_JWT
Chave: SUA_CHAVE_DA_INTEGRACAO
```

### Exemplo testando pedido

```bash
curl -X POST "https://api.lexos.com.br/webhook/Testar?TipoWebhook=Pedido" \
  -H "Authorization: Bearer SEU_TOKEN_JWT" \
  -H "Chave: SUA_CHAVE_DA_INTEGRACAO"
```

### Exemplo testando emissão de nota fiscal

```bash
curl -X POST "https://api.lexos.com.br/webhook/Testar?TipoWebhook=EmissaoNotaFiscal" \
  -H "Authorization: Bearer SEU_TOKEN_JWT" \
  -H "Chave: SUA_CHAVE_DA_INTEGRACAO"
```

### Respostas possíveis

| Status | Significado |
|---:|---|
| `200 OK` | Webhook de teste disparado com sucesso |
| `400 Bad Request` | Erro de validação nos objetos ou parâmetros informados |
| `404 Not Found` | Nenhum anúncio encontrado de acordo com os parâmetros fornecidos |

### Atenção crítica sobre o teste

A documentação da Lexos informa:

> Caso a URL do webhook não responda com `200 Success`, o webhook será excluído.

Por isso, antes de usar `/webhook/Testar`, confirme que sua URL:

1. Está pública na internet;
2. Usa HTTPS;
3. Está respondendo corretamente;
4. Retorna status HTTP `200`;
5. Não exige login manual;
6. Não bloqueia requisições externas;
7. Não demora para responder.

---

## 9. Remover webhook

### Endpoint

```http
DELETE https://api.lexos.com.br/webhook/remover
```

> Observação: na documentação aparece `/Remover` na lista de operações, mas o request informado está como `/webhook/remover`.  
> Para evitar erro, validar no portal da Lexos se a rota é case-sensitive ou se aceita ambas.

### Headers

```http
Authorization: Bearer SEU_TOKEN_JWT
Chave: SUA_CHAVE_DA_INTEGRACAO
```

### Exemplo com cURL

```bash
curl -X DELETE "https://api.lexos.com.br/webhook/remover" \
  -H "Authorization: Bearer SEU_TOKEN_JWT" \
  -H "Chave: SUA_CHAVE_DA_INTEGRACAO"
```

### Respostas possíveis

| Status | Significado |
|---:|---|
| `200 OK` | Webhook removido com sucesso |
| `400 Bad Request` | Erro de validação nos objetos ou parâmetros informados |
| `404 Not Found` | Nenhum anúncio encontrado de acordo com os parâmetros fornecidos |

---

## 10. Como sua API deve receber o webhook

Sua API precisa ter um endpoint público para receber a chamada da Lexos.

Exemplo de endpoint:

```http
POST https://meusistema.com.br/webhooks/lexos
```

### Requisitos recomendados

O endpoint deve:

1. Aceitar requisições `POST`;
2. Receber body em JSON;
3. Registrar logs da requisição recebida;
4. Retornar `200 OK` rapidamente;
5. Processar o evento de forma assíncrona, se possível;
6. Não depender de tela, navegador ou login manual;
7. Ter monitoramento de erros.

---

## 11. Exemplo de endpoint em Node.js com Express

```js
import express from "express";

const app = express();

app.use(express.json({ limit: "5mb" }));

app.post("/webhooks/lexos", async (req, res) => {
  try {
    const payload = req.body;

    console.log("Webhook recebido da Lexos:");
    console.log(JSON.stringify(payload, null, 2));

    /*
      Aqui você pode:
      - identificar o tipo do evento;
      - salvar o payload no banco;
      - enviar para uma fila;
      - integrar com ERP;
      - atualizar pedido;
      - registrar nota fiscal;
      - chamar outro serviço interno.
    */

    return res.status(200).json({
      success: true,
      message: "Webhook recebido com sucesso"
    });
  } catch (error) {
    console.error("Erro ao processar webhook Lexos:", error);

    /*
      Cuidado:
      No teste da Lexos, se a URL não responder 200,
      o webhook pode ser excluído.
    */
    return res.status(200).json({
      success: false,
      message: "Erro registrado, mas webhook recebido"
    });
  }
});

app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});
```

---

## 12. Exemplo de endpoint em Django

```python
import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

@csrf_exempt
def lexos_webhook(request):
    if request.method != "POST":
        return JsonResponse({"error": "Método não permitido"}, status=405)

    try:
        payload = json.loads(request.body.decode("utf-8"))

        print("Webhook recebido da Lexos:")
        print(json.dumps(payload, indent=2, ensure_ascii=False))

        # Aqui você pode:
        # - salvar no banco
        # - criar logs
        # - enviar para Celery
        # - atualizar pedido
        # - processar nota fiscal

        return JsonResponse({
            "success": True,
            "message": "Webhook recebido com sucesso"
        }, status=200)

    except Exception as error:
        print("Erro ao processar webhook Lexos:", error)

        # Para evitar exclusão em teste, pode retornar 200 e registrar o erro internamente.
        return JsonResponse({
            "success": False,
            "message": "Erro registrado, mas webhook recebido"
        }, status=200)
```

---

## 13. Boas práticas para produção

### 13.1. Retornar 200 rapidamente

Evite processar tudo dentro da requisição do webhook.

Melhor fluxo:

```text
Recebe webhook
   ↓
Salva payload/log
   ↓
Retorna 200 para Lexos
   ↓
Processa em segundo plano
```

Isso evita timeout e falhas na entrega.

---

### 13.2. Registrar logs

Salve informações como:

| Campo | Exemplo |
|---|---|
| Data/hora recebida | `2026-05-12 15:30:00` |
| Origem | `Lexos` |
| Tipo de evento | `Pedido` |
| Payload bruto | JSON recebido |
| Status do processamento | `pendente`, `processado`, `erro` |
| Mensagem de erro | Erro retornado pela sua regra interna |

---

### 13.3. Criar controle de idempotência

A mesma notificação pode ser recebida mais de uma vez em alguns cenários.

Por isso, evite duplicar pedidos ou registros.

Exemplo de regra:

```text
Se pedido já existe no banco:
   atualizar dados
Senão:
   criar novo pedido
```

---

### 13.4. Usar HTTPS

A URL cadastrada deve ser pública e segura.

Exemplo correto:

```text
https://integrador.maxxxmoveis.com.br/webhooks/lexos
```

Evite:

```text
http://localhost:3000/webhooks/lexos
http://192.168.0.10/webhooks/lexos
```

---

### 13.5. Usar fila de processamento

Para integrações mais robustas, usar:

- Celery;
- RabbitMQ;
- Redis Queue;
- BullMQ;
- n8n;
- filas internas;
- jobs assíncronos.

---

## 14. Sequência recomendada de implantação

### Passo 1 — Criar endpoint na sua API

Criar endpoint:

```http
POST /webhooks/lexos
```

---

### Passo 2 — Publicar com HTTPS

Exemplo:

```text
https://integrador.maxxxmoveis.com.br/webhooks/lexos
```

---

### Passo 3 — Testar endpoint manualmente

Antes de cadastrar na Lexos, testar com cURL:

```bash
curl -X POST "https://integrador.maxxxmoveis.com.br/webhooks/lexos" \
  -H "Content-Type: application/json" \
  -d '{
    "teste": true,
    "origem": "teste manual"
  }'
```

O endpoint deve retornar:

```json
{
  "success": true,
  "message": "Webhook recebido com sucesso"
}
```

---

### Passo 4 — Cadastrar webhook na Lexos

```bash
curl -X POST "https://api.lexos.com.br/webhook/Cadastrar" \
  -H "Authorization: Bearer SEU_TOKEN_JWT" \
  -H "Chave: SUA_CHAVE_DA_INTEGRACAO" \
  -H "Content-Type: application/json" \
  -d '{
    "WebhookUrl": "https://integrador.maxxxmoveis.com.br/webhooks/lexos"
  }'
```

---

### Passo 5 — Obter webhook para confirmar

```bash
curl -X GET "https://api.lexos.com.br/webhook/Obter" \
  -H "Authorization: Bearer SEU_TOKEN_JWT" \
  -H "Chave: SUA_CHAVE_DA_INTEGRACAO"
```

---

### Passo 6 — Testar webhook

```bash
curl -X POST "https://api.lexos.com.br/webhook/Testar?TipoWebhook=Pedido" \
  -H "Authorization: Bearer SEU_TOKEN_JWT" \
  -H "Chave: SUA_CHAVE_DA_INTEGRACAO"
```

---

### Passo 7 — Conferir logs

Verificar se sua API recebeu o payload da Lexos.

---

## 15. Checklist técnico

Antes de testar na Lexos:

- [ ] Endpoint público criado;
- [ ] Endpoint aceita `POST`;
- [ ] Endpoint aceita JSON;
- [ ] Endpoint responde `200 OK`;
- [ ] Endpoint usa HTTPS;
- [ ] Logs estão funcionando;
- [ ] Banco ou fila de processamento configurados;
- [ ] Token JWT da Lexos obtido;
- [ ] Chave da integração Lexos disponível;
- [ ] Webhook cadastrado na Lexos;
- [ ] Teste realizado com `/webhook/Testar`;
- [ ] Payload recebido e salvo corretamente.

---

## 16. Resumo dos endpoints

| Ação | Método | Endpoint |
|---|---|---|
| Cadastrar webhook | `POST` | `/webhook/Cadastrar` |
| Obter webhook cadastrado | `GET` | `/webhook/Obter` |
| Testar webhook | `POST` | `/webhook/Testar?TipoWebhook=Pedido` |
| Remover webhook | `DELETE` | `/webhook/remover` |

---

## 17. Exemplo completo de uso

### 17.1. Cadastrar

```bash
curl -X POST "https://api.lexos.com.br/webhook/Cadastrar" \
  -H "Authorization: Bearer SEU_TOKEN_JWT" \
  -H "Chave: SUA_CHAVE_DA_INTEGRACAO" \
  -H "Content-Type: application/json" \
  -d '{
    "WebhookUrl": "https://integrador.maxxxmoveis.com.br/webhooks/lexos"
  }'
```

---

### 17.2. Consultar

```bash
curl -X GET "https://api.lexos.com.br/webhook/Obter" \
  -H "Authorization: Bearer SEU_TOKEN_JWT" \
  -H "Chave: SUA_CHAVE_DA_INTEGRACAO"
```

---

### 17.3. Testar

```bash
curl -X POST "https://api.lexos.com.br/webhook/Testar?TipoWebhook=Pedido" \
  -H "Authorization: Bearer SEU_TOKEN_JWT" \
  -H "Chave: SUA_CHAVE_DA_INTEGRACAO"
```

---

### 17.4. Remover

```bash
curl -X DELETE "https://api.lexos.com.br/webhook/remover" \
  -H "Authorization: Bearer SEU_TOKEN_JWT" \
  -H "Chave: SUA_CHAVE_DA_INTEGRACAO"
```

---

## 18. Observação para integração Shopify → Lexos

Se o objetivo for capturar produto criado ou atualizado no Shopify, o webhook deve ser configurado no Shopify, não na Lexos.

Eventos Shopify:

```text
products/create
products/update
```

Fluxo correto:

```text
Shopify
   ↓ webhook products/create ou products/update
Sua API intermediária
   ↓ transforma payload
Lexos Hub API
```

Já o webhook da Lexos documentado aqui serve para a Lexos notificar sua API sobre eventos internos de pedido, estorno, devolução e nota fiscal.

---

## 19. Conclusão

A API de Webhook da Lexos permite cadastrar uma URL única para receber eventos importantes do Lexos Hub.

Principais cuidados:

1. Usar autenticação com `Authorization: Bearer` e header `Chave`;
2. Garantir que a URL cadastrada responda `200 OK`;
3. Ter atenção ao endpoint `/webhook/Testar`, pois se a URL não responder `200`, o webhook pode ser excluído;
4. Registrar logs de todos os payloads recebidos;
5. Processar eventos de forma assíncrona sempre que possível;
6. Separar bem o fluxo de webhook da Lexos e o fluxo de webhook do Shopify.
