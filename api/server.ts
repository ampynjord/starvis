/**
 * STARVIS v2.0 - Star Citizen Ships & Components API
 *
 * Architecture (PostgreSQL multi-schema):
 *   Single PostgreSQL database with schemas:
 *     game  ← ships, components, items, etc. (env column: 'live' | 'ptu')
 *     rsi   ← ship_matrix, galactapedia, comm_links, starmap_locations
 *     meta  ← extraction_log, changelog, manufacturers
 *
 * Features: Pagination, ETag caching, CSV export, Rate limiting, Swagger docs
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPrisma, initPrisma } from '@starvis/db';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { prometheusMiddleware } from './src/middleware/prometheus.js';
import { healthRouter } from './src/routes/health.js';
import { createRoutes } from './src/routes/index.js';
import { GameDataService, ShipMatrixService } from './src/services/index.js';
import { redis } from './src/services/redis.js';
import { RsiWebsiteService } from './src/services/rsi-website-service.js';
import { buildDatabaseUrl, logger, RATE_LIMITS } from './src/utils/index.js';

const PORT = process.env.PORT || 3000;

const app = express();
let gameDataService: GameDataService | null = null;
let httpServer: ReturnType<typeof app.listen> | null = null;

// ===== MIDDLEWARE =====

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));

app.use(prometheusMiddleware);

app.use('/health', healthRouter);

const isTest = process.env.NODE_ENV === 'test';

const speedLimiter = slowDown({
  windowMs: RATE_LIMITS.windowMs,
  delayAfter: RATE_LIMITS.slowAfter,
  delayMs: (hits) => (hits - RATE_LIMITS.slowAfter) * 500,
  maxDelayMs: 20_000,
  skip: () => isTest,
});

const apiLimiter = rateLimit({
  windowMs: RATE_LIMITS.windowMs,
  max: RATE_LIMITS.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later' },
  skipSuccessfulRequests: false,
  skip: () => isTest,
});

const adminLimiter = rateLimit({
  windowMs: RATE_LIMITS.windowMs,
  max: RATE_LIMITS.adminMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Admin rate limit exceeded' },
  skip: () => isTest,
});

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
const swaggerSetup = swaggerUi.setup(swaggerSpec);
// Intercept GET /api-docs (no trailing slash) before Express's router generates an
// absolute-URL redirect using the internal Docker hostname (starvis-api) as Host.
app.get('/api-docs', (req, res, next) => { req.url = '/'; swaggerSetup(req, res, next); });
app.use('/api-docs', swaggerUi.serve, swaggerSetup);

// ===== ROOT =====
app.get('/', (_, res) =>
  res.json({
    name: 'Starvis',
    version: '2.0.0',
    endpoints: {
      ships: '/api/v1/ships',
      groundVehicles: '/api/v1/ground-vehicles',
      gravlev: '/api/v1/gravlev',
      components: '/api/v1/components',
      items: '/api/v1/items',
      commodities: '/api/v1/commodities',
      manufacturers: '/api/v1/manufacturers',
      paints: '/api/v1/paints',
      shops: '/api/v1/shops',
      locations: '/api/v1/locations',
      missions: '/api/v1/missions',
      crafting: '/api/v1/crafting/recipes',
      mining: '/api/v1/mining/elements',
      shipMatrix: '/api/v1/ship-matrix',
      galactapedia: '/api/v1/galactapedia',
      commLinks: '/api/v1/comm-links',
      starmap: '/api/v1/starmap/systems',
      changelog: '/api/v1/changelog',
      search: '/api/v1/search',
      docs: '/api-docs',
      health: '/health',
    },
  }),
);

// ===== STARTUP =====
async function start() {
  // 0. Ensure CTM cache directory exists
  const { mkdirSync } = await import('node:fs');
  const ctmCacheDir = process.env.CTM_CACHE_DIR || '/tmp/ctm-cache';
  mkdirSync(ctmCacheDir, { recursive: true });
  logger.info(`CTM cache dir: ${ctmCacheDir}`, { module: 'Server' });

  // 1. Initialise single Prisma client and connect with retry
  const prisma = initPrisma(buildDatabaseUrl());
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

  // 2. Push schema to PostgreSQL
  try {
    const { execSync } = await import('node:child_process');
    const schemaPath = path.resolve(__dirname, '..', 'db', 'prisma', 'schema.prisma');
    execSync(`npx prisma db push --schema=${schemaPath} --skip-generate --accept-data-loss`, {
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: buildDatabaseUrl() },
    });
    logger.info('✅ Schema synced → PostgreSQL', { module: 'DB' });
  } catch (e: any) {
    logger.error(`Schema sync failed: ${e.stderr?.toString() || e.message}`, { module: 'DB' });
    process.exit(1);
  }

  // 3. Initialize Redis (non-blocking)
  const redisReady = await redis
    .connect()
    .then(() => true)
    .catch(() => false);
  if (redisReady) {
    logger.info('✅ Redis ready', { module: 'Redis' });
  } else {
    logger.warn('⚠️  Redis unavailable, cache disabled', { module: 'Redis' });
  }

  // 4. Services — all use the same single Prisma client
  const shipMatrixService = new ShipMatrixService(prisma);
  const rsiWebsiteService = new RsiWebsiteService(prisma);
  gameDataService = new GameDataService(() => prisma, prisma);

  // 5. Mount routes
  app.use('/', createRoutes({ prisma, getGamePrisma: () => prisma, shipMatrixService, gameDataService, rsiWebsiteService }));

  // 6. Start listening
  httpServer = app.listen(PORT, () => logger.info(`✅ Starvis v2.0 listening on :${PORT}`, { module: 'Server' }));
}

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down…`, { module: 'Server' });
  if (httpServer) httpServer.close();

  try {
    await getPrisma().$disconnect();
    logger.info('Prisma disconnected', { module: 'DB' });
  } catch {
    /* not initialised */
  }

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
