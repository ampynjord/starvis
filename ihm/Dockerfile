# Stage 1: Dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY ihm/package*.json ./ihm/
RUN npm ci --workspace=starvis-ihm

# Stage 2: Build
FROM node:22-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_STARVIS_EXTENSION_CHROME_STORE_URL=
ARG NEXT_PUBLIC_STARVIS_EXTENSION_FIREFOX_STORE_URL=
ENV NEXT_PUBLIC_STARVIS_EXTENSION_CHROME_STORE_URL=$NEXT_PUBLIC_STARVIS_EXTENSION_CHROME_STORE_URL
ENV NEXT_PUBLIC_STARVIS_EXTENSION_FIREFOX_STORE_URL=$NEXT_PUBLIC_STARVIS_EXTENSION_FIREFOX_STORE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/ihm/node_modules ./ihm/node_modules
COPY ihm/ ./ihm/
COPY package*.json ./
RUN npm run build --workspace=starvis-ihm

# Stage 3: Production
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/ihm/public ./ihm/public
COPY --from=builder --chown=nextjs:nodejs /app/ihm/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/ihm/.next/static ./ihm/.next/static

USER nextjs
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/ || exit 1

CMD ["node", "ihm/server.js"]
