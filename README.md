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
