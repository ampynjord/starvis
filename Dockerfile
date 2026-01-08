FROM node:20-alpine

RUN apk add --no-cache chromium wget

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY server.ts .

EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
