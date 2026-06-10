# Integrador Shopify ↔ WooCommerce

Serviço de integração bidirecional entre Shopify e WooCommerce via webhooks, filas assíncronas e sincronização agendada.

## Visão geral

O projeto adota uma arquitetura **Fullstack monolítica baseada no Next.js (App Router)**:
1. **Backend Integrado (API Routes):** Recebe webhooks, gerencia filas assíncronas (BullMQ) através do `instrumentation.ts` e persiste logs no MongoDB.
2. **Frontend Dashboard:** Visualização de dados, logs e acompanhamento das filas em tempo real via **Server-Sent Events (SSE)**.

Fluxo de integração:
```
Shopify ──webhooks──▶ Next.js (API) ──▶ BullMQ (Redis) ──▶ WooCommerce REST API
WooCommerce ──webhooks──▶ Next.js (API) ──▶ BullMQ ──▶ Shopify GraphQL API
```

- Recebe webhooks do Shopify e WooCommerce
- Processa em fila sequencial (concurrency = 1) para evitar condições de corrida
- Jobs com falha vão ao **fim** da fila e reentram até `QUEUE_ATTEMPTS` tentativas
- Logs persistidos no MongoDB; dashboard reativo em tempo real via SSE.

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Fullstack Framework | Next.js 16 (App Router) / React 19 |
| Estilização (Frontend) | TailwindCSS 4, Flowbite |
| Filas & Background | BullMQ + Redis 7 |
| Banco de logs | MongoDB 7 / Mongoose |
| Cache / dedup | Redis (ioredis) |
| Linguagem | TypeScript / Node.js |
| Infraestrutura | Docker Compose |

## Requisitos

- Docker e Docker Compose
- Node.js 20+

## Instalação

```bash
# Clone o repositório
git clone https://github.com/Matheus-Matta/integrador-woo-shopify.git
cd integrador-woo-shopify

# Copie as variáveis de ambiente
cp .env.example .env
```

## Variáveis de ambiente (`.env`)

Crie ou edite o arquivo `.env` com as seguintes variáveis:

```dotenv
PORT=3000
TZ=America/Sao_Paulo

# Shopify
SHOPIFY_URL=https://sua-loja.myshopify.com/admin/api/2024-01/graphql.json
SHOPIFY_ACCESS_TOKEN=shpat_...
SHOPIFY_WEBHOOK_SECRET=...

# WooCommerce
WOO_URL=https://seu-site.com
WOO_KEY=ck_...
WOO_SECRET=cs_...
WOO_WEBHOOK_SECRET=...

# Redis
REDIS_URL=redis://:senha@redis:6379/1
REDIS_PASSWORD=senha
REDIS_CACHE_TTL_SECONDS=300

# Filas BullMQ
QUEUE_ATTEMPTS=3          # tentativas por job antes de descartar
QUEUE_BACKOFF_DELAY_MS=5000

# Rate limiting
RATE_LIMIT_MAX=60
RATE_LIMIT_WINDOW_MS=60000

# MongoDB
MONGODB_URL=mongodb://usuario:senha@mongodb:27017/integrador?authSource=admin
MONGO_ROOT_USER=usuario
MONGO_ROOT_PASSWORD=senha

# Dashboard
DASHBOARD_PASSWORD=senha-do-dashboard
DASHBOARD_JWT_SECRET=segredo-jwt

# Domínio público do integrador (sem barra final)
DOMAIN=https://seu-dominio.com

# Scheduler de sincronização
SCHEDULER_INTERVAL_MS=3600000   # intervalo entre verificações (ms)
SCHEDULER_LOOKBACK_HOURS=2      # janela de lookback em horas
```

## Execução

### Docker (Serviços de apoio)

Recomenda-se subir os serviços de banco de dados e redis via Docker Compose:

```bash
# Sobe o redis e mongodb
docker compose up -d
```

### Desenvolvimento local

```bash
npm install
npm run dev
```
> **Nota:** Os serviços de background (BullMQ, Scheduler) e conexão do MongoDB iniciarão automaticamente através do `instrumentation.ts` apenas no runtime do Node.

### Build de produção

```bash
npm run build
npm start
```

## Estrutura do projeto

```text
├── app/                       # Rotas da API e Páginas UI (Next.js App Router)
│   ├── api/
│   │   ├── auth/              # Endpoints de login e logout (JWT via cookies)
│   │   ├── dashboard/         # Endpoints REST (logs, SSE de eventos em tempo real)
│   │   └── webhooks/          # Recebimento de Webhooks do Shopify e WooCommerce
│   ├── dashboard/             # Páginas protegidas do painel administrativo
│   │   ├── customers/
│   │   ├── errors/
│   │   ├── products/
│   │   ├── queues/
│   │   └── webhooks/
│   └── login/                 # Página de acesso público
├── components/                # Componentes React de UI (Flowbite/Tailwind)
├── hooks/                     # Custom Hooks (React Query, Server-Sent Events)
├── lib/                       # Lógica de Backend (Serviços, Filas, DB)
│   ├── config.ts              # Validação de variáveis de ambiente
│   ├── db/                    # Instância do MongoDB e Redis
│   ├── queue/                 # Filas e Workers (BullMQ)
│   ├── scheduler/             # Agendadores (Sync Checker)
│   ├── services/              # Integração de terceiros (Shopify, WooCommerce)
│   └── utils/                 # Ferramentas auxiliares (validação HMAC, etc)
└── instrumentation.ts         # Boot do banco e dos workers do backend no startup
```

## Webhooks configurados

| Origem | Evento | Ação |
|---|---|---|
| Shopify | `orders/create` | Cria pedido no WooCommerce |
| Shopify | `orders/updated` | Atualiza pedido no WooCommerce |
| Shopify | `customers/create` | Cria/atualiza cliente no WooCommerce |
| Shopify | `customers/updated` | Atualiza cliente no WooCommerce |
| WooCommerce | `order.updated` | Atualiza status do pedido no Shopify |
| WooCommerce | `product.*` | Sincroniza estoque/preço com Shopify |

## API propria compativel com WooCommerce

O projeto tambem expoe endpoints no mesmo formato da WooCommerce REST API para permitir que o ERP continue consumindo produtos sem depender de uma loja WooCommerce real.

Rotas principais:

```text
GET    /wp-json
GET    /wp-json/wc/v3
GET    /wp-json/wc/v3/products
POST   /wp-json/wc/v3/products
GET    /wp-json/wc/v3/products/:id
PUT    /wp-json/wc/v3/products/:id
PATCH  /wp-json/wc/v3/products/:id
DELETE /wp-json/wc/v3/products/:id
POST   /wp-json/wc/v3/products/batch

GET    /wp-json/wc/v3/customers
POST   /wp-json/wc/v3/customers
GET    /wp-json/wc/v3/customers/:id
PUT    /wp-json/wc/v3/customers/:id
PATCH  /wp-json/wc/v3/customers/:id
DELETE /wp-json/wc/v3/customers/:id
POST   /wp-json/wc/v3/customers/batch

GET    /wp-json/wc/v3/orders
POST   /wp-json/wc/v3/orders
GET    /wp-json/wc/v3/orders/:id
PUT    /wp-json/wc/v3/orders/:id
PATCH  /wp-json/wc/v3/orders/:id
DELETE /wp-json/wc/v3/orders/:id
POST   /wp-json/wc/v3/orders/batch
GET/POST/GET:id/DELETE:id /wp-json/wc/v3/orders/:order_id/notes
GET/POST/GET:id/DELETE:id /wp-json/wc/v3/orders/:order_id/refunds

GET/POST/GET:id/PUT:id/DELETE:id /wp-json/wc/v3/products/categories
GET/POST/GET:id/PUT:id/DELETE:id /wp-json/wc/v3/products/tags
GET/POST/GET:id/PUT:id/DELETE:id /wp-json/wc/v3/products/attributes
GET/POST/GET:id/PUT:id/DELETE:id /wp-json/wc/v3/products/attributes/:attribute_id/terms
GET/POST/GET:id/PUT:id/DELETE:id /wp-json/wc/v3/products/:product_id/variations
```

Autenticacao aceita tres modos:

```http
Authorization: Bearer TOKEN
```

Para gerar o token JWT da API:

```bash
curl -X POST "http://localhost:3005/wp-json/jwt-auth/v1/token" \
  -H "Content-Type: application/json" \
  -d '{"username":"woo_api","password":"sua-senha"}'
```

Resposta:

```json
{
  "token": "JWT",
  "token_type": "Bearer",
  "expires_in": "8h"
}
```

```text
?consumer_key=ck_local&consumer_secret=cs_local
```

```text
Basic Auth usando consumer_key como usuario e consumer_secret como senha
```

Variaveis de ambiente novas:

```dotenv
MONGODB_URI=mongodb://localhost:27017/integrador
JWT_SECRET=troque-este-segredo
WOO_API_JWT_USER=woo_api
WOO_API_JWT_PASSWORD=troque-esta-senha
WOO_API_JWT_EXPIRES_IN=8h
DEFAULT_CONSUMER_KEY=ck_local
DEFAULT_CONSUMER_SECRET=cs_local
WOO_COMPAT_SHOPIFY_SYNC_ACTIVE=true
WOO_LEGACY_WEBHOOKS_ACTIVE=true
```

`MONGODB_URL` continua funcionando; `MONGODB_URI` foi adicionado como alias. A URL publica da API vem de `DOMAIN`. Para credenciais por banco, use a colecao `api_keys` com `consumer_key`, `consumer_secret`, `permissions` (`read`, `write` ou `read_write`) e `active=true`.

Quando `WOO_COMPAT_SHOPIFY_SYNC_ACTIVE=true`, os webhooks existentes do Shopify tambem salvam no MongoDB:

- `products/create` e `products/update` viram documentos Woo em `products`
- `customers/create` e `customers/update` viram documentos Woo em `customers`
- `orders/create` e `orders/update` viram documentos Woo em `orders`, vinculando ou criando `customers`

O fluxo antigo de filas continua ativo; essa sincronizacao e uma persistencia adicional para a API compativel com WooCommerce.

Plano de migracao dos webhooks:

- Shopify passa a ser a origem principal para gravar `products`, `customers` e `orders` no Mongo em formato WooCommerce.
- Os webhooks WooCommerce continuam existentes como legado/fallback enquanto a operacao estabiliza.
- `WOO_LEGACY_WEBHOOKS_ACTIVE=true` mantem `/api/webhooks/woo/products` e `/api/webhooks/woo/orders/update` funcionando.
- Quando quiser desligar o Woo de vez, altere para `WOO_LEGACY_WEBHOOKS_ACTIVE=false` ou desligue no painel em `Settings > Integration`.
- Com os webhooks legados desligados, as rotas continuam respondendo com `skipped: true`, sem quebrar chamadas remanescentes durante a transicao.

Exemplo de criacao de produto:

```bash
curl -X POST "http://localhost:3005/wp-json/wc/v3/products?consumer_key=ck_local&consumer_secret=cs_local" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sofa Exemplo",
    "slug": "sofa-exemplo",
    "sku": "ABC123",
    "type": "simple",
    "status": "publish",
    "price": "999.99",
    "regular_price": "1199.99",
    "stock_quantity": 10,
    "stock_status": "instock",
    "categories": [{ "id": 1, "name": "Sofas", "slug": "sofas" }],
    "meta_data": [{ "key": "shopify_id", "value": "gid://shopify/Product/123" }]
  }'
```

Listagem com paginacao:

```bash
curl -i "http://localhost:3005/wp-json/wc/v3/products?page=1&per_page=10&consumer_key=ck_local&consumer_secret=cs_local"
```

A resposta usa JSON no padrao WooCommerce, sempre retorna `id` numerico (`woo_id`) e nunca retorna `_id` do MongoDB. Os headers `X-WP-Total` e `X-WP-TotalPages` sao retornados nas listagens.

Customers e Orders:

```bash
curl -X POST "http://localhost:3005/wp-json/wc/v3/customers?consumer_key=ck_local&consumer_secret=cs_local" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "cliente@example.com",
    "first_name": "Joao",
    "last_name": "Silva",
    "billing": { "email": "cliente@example.com", "phone": "21999999999" },
    "shipping": { "first_name": "Joao", "last_name": "Silva" }
  }'
```

```bash
curl -X POST "http://localhost:3005/wp-json/wc/v3/orders?consumer_key=ck_local&consumer_secret=cs_local" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "1001",
    "status": "processing",
    "currency": "BRL",
    "total": "1049.80",
    "billing": { "email": "cliente@example.com", "first_name": "Joao", "last_name": "Silva" },
    "shipping": { "first_name": "Joao", "last_name": "Silva" },
    "line_items": [{ "name": "Sofa Exemplo", "sku": "ABC123", "quantity": 1, "total": "999.90" }]
  }'
```

Ao criar um pedido, a API vincula o customer nesta ordem: `customer_id`, `shopify_customer_id`, `billing.email`, `shipping.email`. Se nao existir, cria automaticamente o customer usando billing/shipping. O retorno do pedido inclui `customer_id` e nunca expõe `customer_ref` nem `_id`.

Filtros principais:

```bash
curl -i "http://localhost:3005/wp-json/wc/v3/customers?email=cliente@example.com&consumer_key=ck_local&consumer_secret=cs_local"
curl -i "http://localhost:3005/wp-json/wc/v3/orders?customer=1&status=processing&consumer_key=ck_local&consumer_secret=cs_local"
curl -i "http://localhost:3005/wp-json/wc/v3/orders?billing_email=cliente@example.com&min_total=100&consumer_key=ck_local&consumer_secret=cs_local"
```

Batch:

```bash
curl -X POST "http://localhost:3005/wp-json/wc/v3/products/batch?consumer_key=ck_local&consumer_secret=cs_local" \
  -H "Content-Type: application/json" \
  -d '{
    "create": [{ "name": "Produto Novo", "sku": "SKU-1", "price": "10.00" }],
    "update": [{ "id": 1, "status": "draft" }],
    "delete": [2]
  }'
```

Normalizacao Shopify:

```ts
import { normalizeShopifyProductToWooProduct } from '@/lib/woo/normalizers/shopify-to-woo-product';
import { normalizeShopifyCustomerToWooCustomer } from '@/lib/woo/normalizers/shopify-to-woo-customer';
import { normalizeShopifyOrderToWooOrder } from '@/lib/woo/normalizers/shopify-to-woo-order';
import { mapShopifyOrderStatusToWooStatus } from '@/lib/woo/status-mapper';

const wooProduct = normalizeShopifyProductToWooProduct(shopifyProduct);
const wooCustomer = normalizeShopifyCustomerToWooCustomer(shopifyCustomer);
const wooOrder = normalizeShopifyOrderToWooOrder(shopifyOrder);
```

Testes basicos:

```bash
npm run typecheck
npm run test:woo-api
npm run test:shopify-webhook-sync
```

Antes de rodar `npm run test:woo-api`, suba o app com `npm run dev` e deixe MongoDB acessivel. A suite de integracao valida:

- status publico de `/wp-json` e `/wp-json/wc/v3`
- bloqueio sem autenticacao, autenticacao por query string, Basic Auth e login JWT quando `JWT_SECRET`, `WOO_API_JWT_USER` e `WOO_API_JWT_PASSWORD` estiverem definidos
- CRUD, filtros, paginacao e batch de products
- variations, categories, tags, attributes e attribute terms
- CRUD, filtro por e-mail e batch de customers
- CRUD, filtros por customer/status/e-mail/numero/total e batch de orders
- criacao automatica de customer ao criar order sem `customer_id`
- vinculo da order ao customer por `billing.email`
- notes e refunds de orders
- garantia de que `_id`, `customer_ref` e `raw_shopify` nao aparecem nas respostas

A colecao Postman fica em `postman/woo-compatible-api.postman_collection.json`.

Para testar os webhooks Shopify localmente:

```bash
# terminal 1
SKIP_HMAC=true WOO_COMPAT_SHOPIFY_SYNC_ACTIVE=true npm run dev

# terminal 2
npm run test:shopify-webhook-sync
```

No PowerShell:

```powershell
$env:SKIP_HMAC='true'
$env:WOO_COMPAT_SHOPIFY_SYNC_ACTIVE='true'
npm run dev
```

## Estratégia de filas

- **Concurrency = 1**: jobs processados um por vez, sem condições de corrida
- **Retry no fim**: job com falha é recolocado ao fim da fila; outros jobs são processados primeiro
- **`QUEUE_ATTEMPTS`**: número máximo de tentativas antes de registrar erro definitivo
- **Deduplicação**: Redis bloqueia webhooks duplicados dentro de uma janela de tempo

## Dashboard

O Dashboard completo está disponível em `http://localhost:3000`.

- Visualização em tempo real de logs de pedidos, clientes, produtos e erros via **SSE (Server-Sent Events)**.
- Modal detalhado com 3 abas por registro: **Webhook Recebido** / **Payload Enviado** / **Resposta**.
- Autenticação consumindo API Routes com cookies `httpOnly`, a senha é definida em `DASHBOARD_PASSWORD`.

## Licença

MIT
