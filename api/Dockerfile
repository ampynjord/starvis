# ==============================================================
# STARVIS API — Monorepo Dockerfile
# Build context: project root
# ==============================================================
FROM node:22-alpine AS base
WORKDIR /app

# ---- Stage 1: dependencies ----
FROM base AS deps
COPY package*.json ./
COPY db/package.json ./db/
COPY api/package*.json ./api/
COPY db/prisma.config.ts ./db/
COPY db/prisma/ ./db/prisma/

RUN npm ci --workspace=api --workspace=@starvis/db

# ---- Stage 2: build & typecheck ----
FROM deps AS build
COPY db/ ./db/
COPY api/ ./api/
RUN npm run typecheck --workspace=api

# ---- Stage 3: development ----
FROM deps AS development
EXPOSE 3000
CMD ["sh", "-c", "npm install --prefer-offline --silent && npm run dev --workspace=api"]

# ---- Stage 4: production ----
FROM base AS production

COPY package*.json ./
COPY db/package.json ./db/
COPY api/package*.json ./api/
COPY db/prisma.config.ts ./db/
COPY db/prisma/ ./db/prisma/

RUN npm ci --omit=dev --workspace=api --workspace=@starvis/db --ignore-scripts
RUN npm run generate --workspace=@starvis/db

COPY db/ ./db/
COPY api/ ./api/

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs

ARG API_INTERNAL_PORT=3000
EXPOSE ${API_INTERNAL_PORT}

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["npm", "run", "start", "--workspace=api"]
