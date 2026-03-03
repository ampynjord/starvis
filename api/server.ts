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
import * as mysql from 'mysql2/promise';
import swaggerUi from 'swagger-ui-express';

import { createRoutes } from './src/routes.js';
import { GameDataService, initializeSchema, ShipMatrixService } from './src/services/index.js';
import { DB_CONFIG, logger } from './src/utils/index.js';

const PORT = process.env.PORT || 3000;

const app = express();
let pool: mysql.Pool | null = null;
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

// ── Rate limiting (multi-layer, disabled in test) ────────

const isTest = process.env.NODE_ENV === 'test';

// Layer 1: Speed limiter — after 100 req/15min, add 500ms delay per request
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 100,
  delayMs: (hits) => (hits - 100) * 500,
  maxDelayMs: 20_000,
  skip: () => isTest,
});

// Layer 2: Hard rate limit — 200 req/15min per IP (then 429)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '200', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later' },
  skipSuccessfulRequests: false,
  skip: () => isTest,
});

// Layer 3: Strict limit on admin endpoints — 20 req/15min
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Admin rate limit exceeded' },
  skip: () => isTest,
});

// Layer 4: Burst protection — configurable req/min max (prevents hammering)
const burstLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_BURST || '30', 10),
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
  // 1. Database connection with retry
  let dbReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      pool = mysql.createPool(DB_CONFIG);
      const conn = await pool.getConnection();
      await initializeSchema(conn);
      conn.release();
      logger.info('✅ Database ready', { module: 'DB' });
      dbReady = true;
      break;
    } catch (e) {
      logger.warn(String(e), { module: 'DB' });
      logger.warn(`DB retry ${i + 1}/30…`, { module: 'DB' });
      if (pool) {
        await pool.end();
        pool = null;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!dbReady || !pool) {
    logger.error('Database connection failed after 30 retries', { module: 'DB' });
    process.exit(1);
  }

  // 2. Ship Matrix service (always available)
  const shipMatrixService = new ShipMatrixService(pool);

  // 3. GameDataService (reads from MySQL — fed by standalone extractor)
  gameDataService = new GameDataService(pool);

  // 4. Mount routes
  app.use('/', createRoutes({ pool, shipMatrixService, gameDataService }));

  // 5. Start listening BEFORE non-critical sync (so /health is immediately available)
  httpServer = app.listen(PORT, () => logger.info(`✅ Starvis v1.0 listening on :${PORT}`, { module: 'Server' }));

  // 6. Non-critical sync: Ship Matrix (don't block server startup, skip if <24h old)
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

// Graceful shutdown: close HTTP server + DB pool
async function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down…`, { module: 'Server' });
  if (httpServer) httpServer.close();
  if (pool) await pool.end();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
