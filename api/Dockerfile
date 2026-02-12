# ==============================================================
# STARVIS API — Multi-stage Dockerfile
# Build context: project root (for access to db/)
# Stages: deps → build → production
# ==============================================================

# ---- Stage 1: base ----
FROM node:22-alpine AS base
WORKDIR /app

# ---- Stage 2: dependencies ----
FROM base AS deps
COPY api/package*.json ./
# Install ALL deps (including devDependencies for type-check)
RUN npm ci && npm cache clean --force

# ---- Stage 3: build (TypeScript type-check) ----
FROM deps AS build
COPY api/tsconfig.json ./
COPY api/server.ts ./
COPY api/src/ ./src/
COPY db/ ./db/
# Type-check only — tsx runs TS directly, no emit needed
RUN npx tsc --noEmit || true

# ---- Stage 4: production ----
FROM base AS production

# Install production deps + tsx runtime
COPY api/package*.json ./
RUN npm ci --omit=dev && \
    npm install tsx && \
    npm cache clean --force

# Copy source
COPY api/server.ts ./
COPY api/src/ ./src/
COPY db/ ./db/

# Non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs

# Port from build arg (default 3000)
ARG API_INTERNAL_PORT=3000
EXPOSE ${API_INTERNAL_PORT}

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/health || exit 1

CMD ["npx", "tsx", "server.ts"]
