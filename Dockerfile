# Multi-stage build pour optimisation
FROM node:20-alpine AS base

# Installer Chromium et dépendances système (incluant WebGL/Mesa)
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    wget \
    mesa-gl \
    mesa-dri-gallium \
    mesa-egl \
    xvfb \
    xvfb-run

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    DISPLAY=:99

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

# Créer le répertoire X11 avec les bonnes permissions
RUN mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix

# Utiliser un utilisateur non-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Démarrer Xvfb et l'application
CMD sh -c "Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp -ac & npx tsx server.ts"
