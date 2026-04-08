# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

# Instala dependências (incluindo devDependencies para compilar)
COPY package*.json ./
RUN npm ci

# Copia fontes e compila TypeScript → dist/ + copia HTMLs do dashboard
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Remove devDependencies do node_modules para o runtime ficar enxuto
RUN npm prune --omit=dev

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime

# Cria usuário sem privilégios (não roda como root)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copia apenas o necessário da etapa de build
COPY --from=builder /app/dist       ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER appuser

# A porta é definida pela variável PORT no .env / docker-compose
EXPOSE 3005

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
