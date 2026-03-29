# ==============================================================
# STARVIS API — Multi-stage Dockerfile
# Build context: project root (for access to db/)
# Stages: deps → build → development (hot reload) → production
# ==============================================================

# ---- Stage 1: base ----
FROM node:22-alpine AS base
WORKDIR /app

# ---- Stage 2: dependencies ----
FROM base AS deps
COPY api/package*.json ./
COPY api/prisma/ ./prisma/
# Install ALL deps (including devDependencies for type-check)
# postinstall hook will run "prisma generate"
RUN npm ci && npm cache clean --force

# ---- Stage 3: build (TypeScript type-check) ----
FROM deps AS build
COPY api/tsconfig.json ./
COPY api/server.ts ./
COPY api/openapi.json ./
COPY api/src/ ./src/
# Type-check only — tsx runs TS directly, no emit needed
RUN npx tsc --noEmit

# ---- Stage 4: development (hot reload) ----
# Le répertoire source est monté en volume depuis l'hôte (docker-compose.dev.yml).
# tsx watch redémarre l'API automatiquement à chaque modification de fichier.
# node_modules vit dans un named volume séparé pour ne pas être écrasé par le bind.
FROM deps AS development
# Les deps sont déjà installées dans /app/node_modules par le stage deps.
# Au démarrage, npm install --prefer-offline sync si package.json a changé,
# puis tsx watch lance le serveur en mode watch.
EXPOSE 3000
CMD ["sh", "-c", "npm install --prefer-offline --silent && npm run dev"]

# ---- Stage 5: production ----
FROM base AS production

# Install production deps (includes prisma CLI for db push at startup)
COPY api/package*.json ./
COPY api/prisma/ ./prisma/
# --ignore-scripts skips "prepare" (husky, not available in prod)
# then we run prisma generate manually to create the client
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
RUN npx prisma generate

# Copy source
COPY api/server.ts ./
COPY api/openapi.json ./
COPY api/src/ ./src/

# Non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs

# Port from build arg (default 3000)
ARG API_INTERNAL_PORT=3000
EXPOSE ${API_INTERNAL_PORT}

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["npx", "tsx", "server.ts"]
