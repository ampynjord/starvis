# Build context: project root
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY bot/package*.json ./bot/
RUN npm ci --workspace=@starvis/bot

COPY bot/ ./bot/
RUN npm run build --workspace=@starvis/bot

# Production
FROM node:22-alpine
WORKDIR /app

COPY package*.json ./
COPY bot/package*.json ./bot/
RUN npm ci --omit=dev --workspace=@starvis/bot

COPY --from=builder /app/bot/dist ./bot/dist

CMD ["sh", "-c", "node bot/dist/deploy-commands.js && node bot/dist/index.js"]
