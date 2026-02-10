# Build image for StarAPI
FROM node:20-alpine AS base

WORKDIR /app

# Stage de production
FROM base AS production

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dependances de production + tsx
RUN npm install --omit=dev && \
    npm install tsx && \
    npm cache clean --force

# Copier le code source
COPY server.ts .
COPY src/ ./src/
COPY db/ ./db/

# Utiliser un utilisateur non-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["npx", "tsx", "server.ts"]
