/**
 * STARVIS v1.0 - Star Citizen Ships & Components API
 *
 * Architecture:
 *   ship_matrix table    ← ShipMatrixService  ← RSI Ship Matrix API
 *   ships/components/etc ← GameDataService     ← MySQL (fed by standalone extractor)
 *
 * Features: Pagination, ETag caching, CSV export, Rate limiting, Swagger docs
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { getGamePrisma, getStarvisPrisma, initAllPrisma } from './src/db/index.js';
import { prometheusMiddleware } from './src/middleware/prometheus.js';
import { healthRouter } from './src/routes/health.js';
import { createRoutes } from './src/routes/index.js';
import { GameDataService, ShipMatrixService } from './src/services/index.js';
import { redis } from './src/services/redis.js';
import { ALL_DB_NAMES, buildDatabaseUrl, logger, RATE_LIMITS } from './src/utils/index.js';

const PORT = process.env.PORT || 3000;

const app = express();
let gameDataService: GameDataService | null = null;
let httpServer: ReturnType<typeof app.listen> | null = null;

// ===== MIDDLEWARE =====

// Trust proxy (Traefik/nginx in front)
app.set('trust proxy', 1);

// Security headers (XSS, clickjacking, MIME sniffing, etc.)
app.use(
  helmet({
    contentSecurityPolicy: false, // API returns JSON, not HTML
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));

// ──Prometheus metrics middleware ────────────────────────
app.use(prometheusMiddleware);

// ── Health checks (liveness, readiness, metrics) ─────────
app.use('/health', healthRouter);

// ── Rate limiting (multi-layer, disabled in test) ────────

const isTest = process.env.NODE_ENV === 'test';

// Layer 1: Speed limiter — after slowAfter req/window, add 500ms delay per request
const speedLimiter = slowDown({
  windowMs: RATE_LIMITS.windowMs,
  delayAfter: RATE_LIMITS.slowAfter,
  delayMs: (hits) => (hits - RATE_LIMITS.slowAfter) * 500,
  maxDelayMs: 20_000,
  skip: () => isTest,
});

// Layer 2: Hard rate limit — max req/15min per IP (then 429)
const apiLimiter = rateLimit({
  windowMs: RATE_LIMITS.windowMs,
  max: RATE_LIMITS.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later' },
  skipSuccessfulRequests: false,
  skip: () => isTest,
});

// Layer 3: Strict limit on admin endpoints
const adminLimiter = rateLimit({
  windowMs: RATE_LIMITS.windowMs,
  max: RATE_LIMITS.adminMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Admin rate limit exceeded' },
  skip: () => isTest,
});

// Layer 4: Burst protection — max requests per minute per IP
const burstLimiter = rateLimit({
  windowMs: RATE_LIMITS.burstWindowMs,
  max: RATE_LIMITS.burst,
  standardHeaders: false,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests per minute, slow down' },
  skip: () => isTest,
});

app.use('/api', burstLimiter, speedLimiter, apiLimiter);
app.use('/admin', adminLimiter);

// Request logging (skip /health to avoid noise)
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    const color = status >= 400 ? 'warn' : 'info';
    logger[color](`${req.method} ${req.path} → ${status}`, { module: 'HTTP', duration: `${ms}ms` });
  });
  next();
});

// ===== SWAGGER / OPENAPI =====
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const swaggerSpec = JSON.parse(readFileSync(path.join(__dirname, 'openapi.json'), 'utf-8'));
swaggerSpec.servers = [{ url: '/', description: 'Current host' }];
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ===== ROOT =====
app.get('/', (_, res) =>
  res.json({
    name: 'Starvis',
    version: '1.0.0',
    endpoints: {
      shipMatrix: '/api/v1/ship-matrix',
      ships: '/api/v1/ships',
      components: '/api/v1/components',
      manufacturers: '/api/v1/manufacturers',
      compare: '/api/v1/ships/:uuid/compare/:uuid2',
      version: '/api/v1/version',
      docs: '/api-docs',
      admin: '/admin/* (requires X-API-Key)',
      health: '/health',
    },
  }),
);

// ===== STARTUP =====
async function start() {
  // 1. Initialise Prisma clients for all 3 databases + connect with retry
  const prisma = initAllPrisma(buildDatabaseUrl);
  let dbReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      await prisma.$queryRawUnsafe('SELECT 1');
      logger.info('✅ Database ready', { module: 'DB' });
      dbReady = true;
      break;
    } catch (e) {
      logger.warn(String(e), { module: 'DB' });
      logger.warn(`DB retry ${i + 1}/30…`, { module: 'DB' });
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!dbReady) {
    logger.error('Database connection failed after 30 retries', { module: 'DB' });
    process.exit(1);
  }

  // 2. Sync schema via Prisma to all 3 databases (starvis, live, ptu)
  try {
    const { execSync } = await import('node:child_process');
    for (const dbName of ALL_DB_NAMES) {
      execSync('npx prisma db push --skip-generate --accept-data-loss', {
        stdio: 'pipe',
        env: { ...process.env, DATABASE_URL: buildDatabaseUrl(dbName) },
      });
      logger.info(`✅ Schema synced → ${dbName}`, { module: 'DB' });
    }
  } catch (e: any) {
    logger.error(`Schema sync failed: ${e.stderr?.toString() || e.message}`, { module: 'DB' });
    process.exit(1);
  }

  // 3. Initialize Redis (non-blocking, cache disabled if unavailable)
  const redisReady = await redis
    .connect()
    .then(() => true)
    .catch(() => false);
  if (redisReady) {
    logger.info('✅ Redis ready', { module: 'Redis' });
  } else {
    logger.warn('⚠️  Redis unavailable, cache disabled', { module: 'Redis' });
  }

  // 4. Ship Matrix service (always available — uses starvis DB)
  const starvisClient = getStarvisPrisma();
  const shipMatrixService = new ShipMatrixService(starvisClient);

  // 5. GameDataService (reads from MySQL — fed by standalone extractor)
  gameDataService = new GameDataService(getGamePrisma, starvisClient);

  // 6. Mount routes
  app.use('/', createRoutes({ prisma: starvisClient, shipMatrixService, gameDataService }));

  // 7. Start listening BEFORE non-critical sync (so /health is immediately available)
  httpServer = app.listen(PORT, () => logger.info(`✅ Starvis v1.0 listening on :${PORT}`, { module: 'Server' }));

  // 7. Non-critical sync: Ship Matrix (don't block server startup, skip if <24h old)
  try {
    const needsSync = await shipMatrixService.isSyncNeeded();
    if (needsSync) {
      logger.info('Syncing RSI Ship Matrix (data stale or missing)…', { module: 'ShipMatrix' });
      const smResult = await shipMatrixService.sync();
      logger.info(`✅ Ship Matrix synced: ${smResult.synced}/${smResult.total}`, { module: 'ShipMatrix' });
    } else {
      logger.info('Ship Matrix sync skipped (last sync <24h ago)', { module: 'ShipMatrix' });
    }
  } catch (e) {
    logger.warn('Ship Matrix sync failed (non-blocking)', { module: 'ShipMatrix' });
    logger.warn(String(e));
  }
}

// Graceful shutdown: close HTTP server + disconnect Prisma + Redis
async function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down…`, { module: 'Server' });
  if (httpServer) httpServer.close();

  // Disconnect Prisma
  try {
    await getStarvisPrisma().$disconnect();
    logger.info('Prisma disconnected', { module: 'DB' });
  } catch {
    /* not initialised */
  }

  // Disconnect Redis
  try {
    await redis.quit();
    logger.info('Redis disconnected', { module: 'Redis' });
  } catch {
    /* not initialised */
  }

  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
