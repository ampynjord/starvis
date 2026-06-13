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
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { requireExternalApiAccess } from './src/middleware/auth.js';
import { prometheusMiddleware } from './src/middleware/prometheus.js';
import { healthRouter } from './src/routes/health.js';
import { createRoutes } from './src/routes/index.js';
import { verifyAuthToken } from './src/services/auth-service.js';
import { GameDataService } from './src/services/game-data-service.js';
import { redis } from './src/services/redis.js';
import { recordRequestLog } from './src/services/request-log-service.js';
import { RsiWebsiteService } from './src/services/rsi-website-service.js';
import { ShipMatrixService } from './src/services/ship-matrix-service.js';
import { AUTH_COOKIE_NAME, DEVELOPER_ACCESS_ROLES } from './src/utils/config.js';
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

// Credentialed CORS only with an explicit allowlist: `Access-Control-Allow-Origin: *`
// is incompatible with credentials, so the wildcard fallback stays credential-less.
const corsOrigin = process.env.CORS_ORIGIN;
app.use(
  corsOrigin && corsOrigin !== '*'
    ? cors({ origin: corsOrigin.split(',').map((o) => o.trim()), credentials: true })
    : cors({ origin: '*' }),
);
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

// Strict limiter for credential-sensitive endpoints (password brute-force,
// TOTP guessing, reset-email spam). Successful requests are not counted so
// legitimate users are unaffected.
const authLimiter = rateLimit({
  windowMs: RATE_LIMITS.windowMs,
  max: RATE_LIMITS.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many authentication attempts, please try again later' },
  skipSuccessfulRequests: true,
  skip: () => isTest,
});

app.use('/api', burstLimiter, speedLimiter, apiLimiter);
app.use('/admin', adminLimiter);
app.use(
  ['/auth/login', '/auth/register', '/auth/forgot-password', '/auth/reset-password', '/auth/verify-email', '/auth/2fa/verify'],
  authLimiter,
);

app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    recordRequestLog(req, status, ms);
    const color = status >= 400 ? 'warn' : 'info';
    logger[color](`${req.method} ${req.path} → ${status}`, { module: 'HTTP', duration: `${ms}ms` });
  });
  next();
});

app.use('/api/v1', requireExternalApiAccess);

// ===== SWAGGER / OPENAPI =====
const __dirname = path.dirname(fileURLToPath(import.meta.url));
type OpenApiSpec = {
  servers?: Array<Record<string, unknown>>;
  paths?: Record<string, unknown>;
  tags?: Array<{ name?: string; [key: string]: unknown }>;
  [key: string]: unknown;
};

function cloneSpec(spec: OpenApiSpec): OpenApiSpec {
  return JSON.parse(JSON.stringify(spec)) as OpenApiSpec;
}

function withoutAdminRoutes(spec: OpenApiSpec): OpenApiSpec {
  const publicSpec = cloneSpec(spec);
  publicSpec.paths = Object.fromEntries(Object.entries(publicSpec.paths ?? {}).filter(([route]) => !route.startsWith('/admin')));
  publicSpec.tags = (publicSpec.tags ?? []).filter((tag) => tag.name !== 'Admin' && tag.name !== 'Administration');
  return publicSpec;
}

function makeSwaggerHtml(specUrl: string, assetBasePath: string): string {
  const config = JSON.stringify({
    url: specUrl,
    dom_id: '#swagger-ui',
    defaultModelsExpandDepth: 1,
    displayRequestDuration: true,
    persistAuthorization: true,
    presets: ['SwaggerUIBundle.presets.apis', 'SwaggerUIStandalonePreset'],
    plugins: ['SwaggerUIBundle.plugins.DownloadUrl'],
    layout: 'StandaloneLayout',
  })
    .replace('"SwaggerUIBundle.presets.apis"', 'SwaggerUIBundle.presets.apis')
    .replace('"SwaggerUIStandalonePreset"', 'SwaggerUIStandalonePreset')
    .replace('"SwaggerUIBundle.plugins.DownloadUrl"', 'SwaggerUIBundle.plugins.DownloadUrl');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Swagger UI</title>
  <link rel="stylesheet" href="${assetBasePath}/swagger-ui.css" />
  <link rel="icon" type="image/png" href="${assetBasePath}/favicon-32x32.png" sizes="32x32" />
  <link rel="icon" type="image/png" href="${assetBasePath}/favicon-16x16.png" sizes="16x16" />
  <style>
    html{box-sizing:border-box;overflow-y:scroll}
    *,*:before,*:after{box-sizing:inherit}
    body{margin:0;background:#1b1f22}
    .swagger-ui .topbar .download-url-wrapper{display:none}
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${assetBasePath}/swagger-ui-bundle.js"></script>
  <script src="${assetBasePath}/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle(${config});
    };
  </script>
</body>
</html>`;
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

function getCookieToken(req: Request): string | null {
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  const match = cookie.split(';').find((c) => c.trim().startsWith(`${AUTH_COOKIE_NAME}=`));
  return match ? (match.split('=')[1]?.trim() ?? null) : null;
}

function apiDocsAccessDenied(req: Request, res: Response) {
  const message =
    'API documentation access requires the developer role. Please ask an administrator to grant you the developer role to access the Starvis API.';
  const wantsHtml = req.accepts(['html', 'json']) === 'html';
  if (!wantsHtml) return res.status(403).json({ success: false, error: message });
  return res
    .status(403)
    .type('html')
    .send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Starvis API Access</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050b12;color:#d7f7ff;font-family:Arial,sans-serif}
    main{max-width:560px;padding:32px;border:1px solid #075b72;background:#07131f}
    h1{margin:0 0 12px;font-size:20px;letter-spacing:.08em;text-transform:uppercase;color:#20e4ff}
    p{margin:0;line-height:1.6;color:#9db4c4}
  </style>
</head>
<body><main><h1>Developer role required</h1><p>${message}</p></main></body>
</html>`);
}

async function requireApiDocsDeveloper(req: Request, res: Response, next: NextFunction) {
  if (!process.env.JWT_SECRET) return res.status(500).json({ success: false, error: 'Server misconfiguration: JWT_SECRET not set' });
  const token = getBearerToken(req) ?? getCookieToken(req);
  if (!token) return apiDocsAccessDenied(req, res);
  try {
    const payload = verifyAuthToken(token);
    const currentUser = await getPrisma().user.findUnique({
      where: { id: payload.sub },
      select: { role: true },
    });
    const currentRole = currentUser?.role ?? payload.role;
    if (!DEVELOPER_ACCESS_ROLES.includes(currentRole as (typeof DEVELOPER_ACCESS_ROLES)[number])) {
      return apiDocsAccessDenied(req, res);
    }
    req.jwtPayload = { ...payload, role: currentRole };
    return next();
  } catch {
    return apiDocsAccessDenied(req, res);
  }
}

const fullSwaggerSpec = JSON.parse(readFileSync(path.join(__dirname, 'openapi.json'), 'utf-8')) as OpenApiSpec;
fullSwaggerSpec.servers = [{ url: '/', description: 'Current host' }];
const publicSwaggerSpec = withoutAdminRoutes(fullSwaggerSpec);
// Generate HTML with absolute asset paths so it works at /api-docs (no trailing slash).
// swagger-ui-express uses relative paths (./swagger-ui.css) by default, which break when
// the browser URL has no trailing slash (./foo resolves to /foo instead of /api-docs/foo).
const swaggerHtml = makeSwaggerHtml('/api-docs/openapi.json', '/api-docs');
app.get('/api-docs', requireApiDocsDeveloper, (_, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(swaggerHtml);
});
app.get('/api-docs/openapi.json', requireApiDocsDeveloper, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const role = (req as Request & { jwtPayload?: { role?: string } }).jwtPayload?.role;
  res.json(role === 'admin' ? fullSwaggerSpec : publicSwaggerSpec);
});
app.use('/api-docs', swaggerUi.serve);

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

  // 2. Optionally apply pending migrations at startup (DB_MIGRATE_ON_STARTUP=true).
  //    Never uses `db push --accept-data-loss`: destructive changes must go
  //    through reviewed migration files in db/prisma/migrations.
  const shouldMigrate = process.env.DB_MIGRATE_ON_STARTUP === 'true' || process.env.DB_PUSH_ON_STARTUP === 'true';
  if (shouldMigrate) {
    try {
      const { execFileSync } = await import('node:child_process');
      execFileSync('npm', ['run', 'migrate:deploy', '--workspace=@starvis/db'], {
        cwd: path.resolve(__dirname, '..'),
        stdio: 'pipe',
        env: { ...process.env, DATABASE_URL: buildDatabaseUrl() },
      });
      logger.info('✅ Migrations applied → PostgreSQL', { module: 'DB' });
    } catch (e: any) {
      logger.error(`Migration deploy failed: ${e.stderr?.toString() || e.message}`, { module: 'DB' });
      process.exit(1);
    }
  } else {
    logger.info('Migration deploy skipped at startup', { module: 'DB' });
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
