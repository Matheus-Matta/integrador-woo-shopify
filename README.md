# Integrador Shopify ↔ WooCommerce

Serviço de integração bidirecional entre Shopify e WooCommerce via webhooks, filas assíncronas e sincronização agendada.

## Visão geral

```
Shopify ──webhooks──▶ Fastify ──▶ BullMQ (Redis) ──▶ WooCommerce REST API
WooCommerce ──webhooks──▶ Fastify ──▶ BullMQ ──▶ Shopify GraphQL API
```

- Recebe webhooks do Shopify e WooCommerce
- Processa em fila sequencial (concurrency = 1) para evitar condições de corrida
- Jobs com falha vão ao **fim** da fila e reentram até `QUEUE_ATTEMPTS` tentativas
- Logs persistidos no MongoDB; dashboard em tempo real via WebSocket

## Tecnologias

| Camada | Tecnologia |
|---|---|
| HTTP server | Fastify 5 |
| Filas | BullMQ + Redis 7 |
| Banco de logs | MongoDB 7 / Mongoose |
| Cache / dedup | Redis (ioredis) |
| Linguagem | TypeScript / Node.js |
| Infraestrutura | Docker Compose |

## Requisitos

- Docker e Docker Compose
- Node.js 20+ (apenas para desenvolvimento local)

## Instalação

```bash
# Clone o repositório
git clone https://github.com/Matheus-Matta/integrador-woo-shopify.git
cd integrador-woo-shopify

# Copie e preencha as variáveis de ambiente
cp .env.example .env
```

## Variáveis de ambiente

Crie um arquivo `.env` na raiz com as seguintes variáveis:

```dotenv
PORT=3005
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

### Docker (recomendado)

```bash
# Sobe tudo (app + redis + mongodb)
docker compose up -d

# Acompanha logs
docker compose logs -f app
```

### Desenvolvimento local

```bash
npm install
npm run dev
```

### Build de produção

```bash
npm run build
npm start
```

## Estrutura do projeto

```
src/
├── config.ts                  # Leitura e validação das variáveis de ambiente
├── index.ts                   # Entry point
├── server.ts                  # Instância Fastify + plugins + rotas
├── dashboard/
│   ├── api.ts                 # Endpoints REST do dashboard
│   ├── auth.ts                # JWT login/logout
│   ├── webhooks.ts            # Listagem de webhooks registrados
│   ├── ws.ts                  # WebSocket para logs em tempo real
│   ├── index.html             # SPA do dashboard (Alpine.js + Tailwind)
│   └── login.html             # Tela de login
├── db/
│   ├── mongo.ts               # Schemas Mongoose (orders, customers, products, errors)
│   └── redis.ts               # Instância ioredis
├── queue/
│   ├── queues.ts              # Definição das filas BullMQ
│   ├── workers.ts             # Workers + lógica de retry no fim da fila
│   └── handlers/
│       ├── order-handlers.ts  # Handlers de pedidos (create/update)
│       └── product-handlers.ts# Handlers de produtos
├── routes/
│   ├── shop-order-create.ts   # Webhook Shopify orders/create
│   ├── shop-order-update.ts   # Webhook Shopify orders/updated
│   ├── shop-customer-create.ts# Webhook Shopify customers/create
│   ├── shop-customer-update.ts# Webhook Shopify customers/updated
│   ├── woo-order-update.ts    # Webhook WooCommerce order.updated
│   └── woo-product.ts         # Webhook WooCommerce product.*
├── scheduler/
│   └── syncChecker.ts         # Verificação periódica de sincronização
├── services/
│   ├── emitter.ts             # EventEmitter para logs em tempo real
│   ├── jwtDenylist.ts         # Denylist de tokens JWT revogados
│   ├── logger.ts              # Funções de log para MongoDB
│   ├── shopify.ts             # Cliente GraphQL Shopify
│   ├── webhookDedup.ts        # Deduplicação de webhooks via Redis
│   └── woocommerce.ts         # Cliente REST WooCommerce
└── utils/
    ├── helpers.ts             # Transformações de dados (payload, endereço, frete)
    └── webhook-validator.ts   # Validação HMAC de webhooks
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

## Estratégia de filas

- **Concurrency = 1**: jobs processados um por vez, sem condições de corrida
- **Retry no fim**: job com falha é recolocado ao fim da fila; outros jobs são processados primeiro
- **`QUEUE_ATTEMPTS`**: número máximo de tentativas antes de registrar erro definitivo
- **Deduplicação**: Redis bloqueia webhooks duplicados dentro de uma janela de tempo

## Dashboard

Acesse `http://localhost:3005/dashboard` após subir o serviço.

- Visualização em tempo real de logs de pedidos, clientes, produtos e erros
- Modal com 3 painéis por registro: **Webhook recebido** / **Payload enviado ao Woo** / **Resposta do Woo**
- Autenticação via JWT com senha definida em `DASHBOARD_PASSWORD`

## Licença

MIT
