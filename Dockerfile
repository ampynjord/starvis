# Multi-stage build pour optimisation
FROM node:20-alpine AS base

# Installer Chromium et dépendances système
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    wget

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Stage de production
FROM base AS production

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances de production + tsx
RUN npm ci --only=production && \
    npm install tsx && \
    npm cache clean --force

# Copier le code source
COPY server.ts .

# Créer le dossier cache
RUN mkdir -p /app/cache && chmod 777 /app/cache

# Utiliser un utilisateur non-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["npx", "tsx", "server.ts"]
