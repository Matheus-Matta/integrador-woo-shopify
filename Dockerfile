# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

# Dependências necessárias para Next em Alpine
RUN apk add --no-cache libc6-compat

# Instala dependências
COPY package*.json ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm ci

# Copia fontes e compila
COPY . .
# Build com output standalone (configurado no next.config.ts)
RUN npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime

WORKDIR /app

RUN apk add --no-cache libc6-compat

# Cria usuário sem privilégios
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copia apenas o necessário do build (standalone)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Permissões
RUN chown -R appuser:appgroup /app

USER appuser

# Porta padrão (sobreposta por env/compose)
ENV NODE_ENV=production \
	PORT=3005

EXPOSE 3005

# Inicia o servidor standalone do Next
CMD ["node", "server.js"]
