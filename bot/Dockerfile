FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY tsconfig.json ./
COPY src/ ./src/

# Deploy slash commands on start, then run the bot
CMD ["sh", "-c", "npx tsx src/deploy-commands.ts && npx tsx src/index.ts"]
