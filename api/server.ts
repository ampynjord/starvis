/**
 * STARVIS v1.0 - Star Citizen Ships & Components API
 *
 * Architecture:
 *   ship_matrix table    ← ShipMatrixService  ← RSI Ship Matrix API
 *   ships/components/etc ← GameDataService     ← MySQL (fed by standalone extractor)
 *
 * Features: Pagination, ETag caching, CSV export, Rate limiting, Swagger docs
 */
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import slowDown from "express-slow-down";
import helmet from "helmet";
import * as mysql from "mysql2/promise";
import swaggerUi from "swagger-ui-express";

import { createRoutes } from "./src/routes.js";
import { GameDataService, ShipMatrixService, initializeSchema } from "./src/services/index.js";
import { DB_CONFIG, logger } from "./src/utils/index.js";

const PORT = process.env.PORT || 3000;

const app = express();
let pool: mysql.Pool | null = null;
let gameDataService: GameDataService | null = null;
let httpServer: ReturnType<typeof app.listen> | null = null;

// ===== MIDDLEWARE =====

// Trust proxy (Traefik/nginx in front)
app.set("trust proxy", 1);

// Security headers (XSS, clickjacking, MIME sniffing, etc.)
app.use(helmet({
  contentSecurityPolicy: false, // API returns JSON, not HTML
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

app.use(cors({ origin: process.env.CORS_ORIGIN || "*", credentials: true }));
app.use(express.json({ limit: "1mb" }));

// ── Rate limiting (multi-layer, disabled in test) ────────

const isTest = process.env.NODE_ENV === "test";

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
  max: parseInt(process.env.RATE_LIMIT_MAX || "200"),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests, please try again later" },
  skipSuccessfulRequests: false,
  skip: () => isTest,
});

// Layer 3: Strict limit on admin endpoints — 20 req/15min
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Admin rate limit exceeded" },
  skip: () => isTest,
});

// Layer 4: Burst protection — 30 req/min max (prevents hammering)
const burstLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: false,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests per minute, slow down" },
  skip: () => isTest,
});

app.use("/api", burstLimiter, speedLimiter, apiLimiter);
app.use("/admin", adminLimiter);

// Request logging (skip /health to avoid noise)
app.use((req, res, next) => {
  if (req.path === "/health") return next();
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    const color = status >= 400 ? "warn" : "info";
    logger[color](`${req.method} ${req.path} → ${status}`, { module: "HTTP", duration: `${ms}ms` });
  });
  next();
});

// ===== SWAGGER / OPENAPI =====
const swaggerSpec: Record<string, unknown> = {
  openapi: "3.0.0",
  info: {
    title: "Starvis API",
    version: "1.0.0",
    description: "Star Citizen Ships & Components API — Extracted from P4K game data and RSI Ship Matrix.",
  },
  servers: [
    { url: `http://localhost:${PORT}`, description: "Local" },
  ],
  tags: [
    { name: "Ships", description: "Ship database (game data + RSI)" },
    { name: "Components", description: "Component database" },
    { name: "Paints", description: "Ship paint/livery database" },
    { name: "Shops", description: "In-game shop definitions" },
    { name: "Manufacturers", description: "Ship & component manufacturers" },
    { name: "Ship Matrix", description: "RSI Ship Matrix mirror" },
    { name: "Loadout", description: "Loadout simulator" },
    { name: "Changelog", description: "Data change tracking" },
    { name: "System", description: "Health & version" },
  ],
  paths: {
    "/api/v1/ships": {
      get: {
        tags: ["Ships"], summary: "List ships (paginated)", operationId: "getShips",
        parameters: [
          { name: "search", in: "query", schema: { type: "string" }, description: "Search by name or class_name" },
          { name: "manufacturer", in: "query", schema: { type: "string" }, description: "Filter by manufacturer code" },
          { name: "career", in: "query", schema: { type: "string" } },
          { name: "role", in: "query", schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string" }, description: "flight-ready, in-concept, in-production, in-game-only" },
          { name: "vehicle_category", in: "query", schema: { type: "string" }, description: "ship, ground, gravlev" },
          { name: "sort", in: "query", schema: { type: "string", default: "name" } },
          { name: "order", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
          { name: "format", in: "query", schema: { type: "string", enum: ["json", "csv"] } },
        ],
        responses: { "200": { description: "Paginated ship list" } },
      },
    },
    "/api/v1/ships/filters": { get: { tags: ["Ships"], summary: "Get available ship filter values (roles, careers)", responses: { "200": { description: "Filter values" } } } },
    "/api/v1/ships/manufacturers": { get: { tags: ["Ships"], summary: "Get manufacturers that have ships", responses: { "200": { description: "Manufacturer list with ship count" } } } },
    "/api/v1/ships/{uuid}": {
      get: {
        tags: ["Ships"], summary: "Get ship by UUID or class_name",
        parameters: [{ name: "uuid", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Ship details" }, "404": { description: "Not found" } },
      },
    },
    "/api/v1/ships/{uuid}/loadout": {
      get: {
        tags: ["Ships"], summary: "Get ship loadout (hierarchical component tree)",
        parameters: [{ name: "uuid", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Loadout tree" } },
      },
    },
    "/api/v1/ships/{uuid}/modules": {
      get: {
        tags: ["Ships"], summary: "Get ship modules (Retaliator, Apollo, etc.)",
        parameters: [{ name: "uuid", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Module list" } },
      },
    },
    "/api/v1/ships/{uuid}/paints": {
      get: {
        tags: ["Ships"], summary: "Get available paints for a ship",
        parameters: [{ name: "uuid", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Paint list" } },
      },
    },
    "/api/v1/ships/{uuid}/compare/{uuid2}": {
      get: {
        tags: ["Ships"], summary: "Compare two ships",
        parameters: [
          { name: "uuid", in: "path", required: true, schema: { type: "string" } },
          { name: "uuid2", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Comparison result" } },
      },
    },
    "/api/v1/components": {
      get: {
        tags: ["Components"], summary: "List components (paginated)",
        parameters: [
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "type", in: "query", schema: { type: "string" }, description: "WeaponGun, Shield, QuantumDrive, etc." },
          { name: "sub_type", in: "query", schema: { type: "string" } },
          { name: "size", in: "query", schema: { type: "integer" } },
          { name: "grade", in: "query", schema: { type: "string" } },
          { name: "manufacturer", in: "query", schema: { type: "string" } },
          { name: "sort", in: "query", schema: { type: "string", default: "name" } },
          { name: "order", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
        ],
        responses: { "200": { description: "Paginated component list" } },
      },
    },
    "/api/v1/components/filters": { get: { tags: ["Components"], summary: "Get available component filter values", responses: { "200": { description: "types, sub_types, sizes, grades" } } } },
    "/api/v1/components/{uuid}": {
      get: {
        tags: ["Components"], summary: "Get component by UUID or class_name",
        parameters: [{ name: "uuid", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Component details" }, "404": { description: "Not found" } },
      },
    },
    "/api/v1/components/{uuid}/buy-locations": {
      get: {
        tags: ["Components"], summary: "Get shops selling a component",
        parameters: [{ name: "uuid", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Buy locations with prices" } },
      },
    },
    "/api/v1/paints": {
      get: {
        tags: ["Paints"], summary: "List all paints (paginated)",
        parameters: [
          { name: "search", in: "query", schema: { type: "string" }, description: "Search by paint or ship name" },
          { name: "ship_uuid", in: "query", schema: { type: "string" }, description: "Filter by ship UUID" },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
        ],
        responses: { "200": { description: "Paginated paint list" } },
      },
    },
    "/api/v1/shops": {
      get: {
        tags: ["Shops"], summary: "List shops (paginated)",
        parameters: [
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "location", in: "query", schema: { type: "string" } },
          { name: "type", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
        ],
        responses: { "200": { description: "Paginated shop list" } },
      },
    },
    "/api/v1/shops/{id}/inventory": {
      get: {
        tags: ["Shops"], summary: "Get shop inventory",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Inventory items" } },
      },
    },
    "/api/v1/manufacturers": { get: { tags: ["Manufacturers"], summary: "List all manufacturers", responses: { "200": { description: "Manufacturer list" } } } },
    "/api/v1/ship-matrix": { get: { tags: ["Ship Matrix"], summary: "Get all RSI Ship Matrix entries", responses: { "200": { description: "Ship Matrix entries" } } } },
    "/api/v1/ship-matrix/stats": { get: { tags: ["Ship Matrix"], summary: "Ship Matrix statistics", responses: { "200": { description: "Stats" } } } },
    "/api/v1/ship-matrix/{id}": {
      get: {
        tags: ["Ship Matrix"], summary: "Get Ship Matrix entry by ID or name",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Entry" }, "404": { description: "Not found" } },
      },
    },
    "/api/v1/loadout/calculate": {
      post: {
        tags: ["Loadout"], summary: "Calculate loadout stats with optional component swaps",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["shipUuid"], properties: { shipUuid: { type: "string" }, swaps: { type: "array", items: { type: "object", properties: { portName: { type: "string" }, componentUuid: { type: "string" } } } } } } } } },
        responses: { "200": { description: "Calculated loadout stats" } },
      },
    },
    "/api/v1/changelog": {
      get: {
        tags: ["Changelog"], summary: "Get data changelog",
        parameters: [
          { name: "entity_type", in: "query", schema: { type: "string" } },
          { name: "change_type", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: { "200": { description: "Changelog entries" } },
      },
    },
    "/api/v1/version": { get: { tags: ["System"], summary: "Get latest extraction info", responses: { "200": { description: "Version info" } } } },
    "/health": { get: { tags: ["System"], summary: "Health check", responses: { "200": { description: "OK" } } } },
  },
};
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ===== ROOT =====
app.get("/", (_, res) => res.json({
  name: "Starvis",
  version: "1.0.0",
  endpoints: {
    shipMatrix: "/api/v1/ship-matrix",
    ships: "/api/v1/ships",
    components: "/api/v1/components",
    manufacturers: "/api/v1/manufacturers",
    compare: "/api/v1/ships/:uuid/compare/:uuid2",
    version: "/api/v1/version",
    docs: "/api-docs",
    admin: "/admin/* (requires X-API-Key)",
    health: "/health",
  },
}));

// ===== STARTUP =====
async function start() {
  // 1. Database connection with retry
  for (let i = 0; i < 30; i++) {
    try {
      pool = mysql.createPool(DB_CONFIG);
      const conn = await pool.getConnection();
      await initializeSchema(conn);
      conn.release();
      logger.info("✅ Database ready", { module: "DB" });
      break;
    } catch (e) {
      logger.warn(`DB retry ${i + 1}/30…`, { module: "DB" });
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  if (!pool) { logger.error("Database connection failed after 30 retries", { module: "DB" }); process.exit(1); }

  // 2. Ship Matrix service (always available)
  const shipMatrixService = new ShipMatrixService(pool);

  // 3. GameDataService (reads from MySQL — fed by standalone extractor)
  gameDataService = new GameDataService(pool);

  // 4. Mount routes
  app.use("/", createRoutes({ pool, shipMatrixService, gameDataService }));

  // 5. Start listening BEFORE non-critical sync (so /health is immediately available)
  httpServer = app.listen(PORT, () => logger.info(`✅ Starvis v1.0 listening on :${PORT}`, { module: "Server" }));

  // 6. Non-critical sync: Ship Matrix (don't block server startup, skip if <24h old)
  try {
    const needsSync = await shipMatrixService.isSyncNeeded();
    if (needsSync) {
      logger.info("Syncing RSI Ship Matrix (data stale or missing)…", { module: "ShipMatrix" });
      const smResult = await shipMatrixService.sync();
      logger.info(`✅ Ship Matrix synced: ${smResult.synced}/${smResult.total}`, { module: "ShipMatrix" });
    } else {
      logger.info("Ship Matrix sync skipped (last sync <24h ago)", { module: "ShipMatrix" });
    }
  } catch (e) {
    logger.warn("Ship Matrix sync failed (non-blocking)", { module: "ShipMatrix" });
    logger.warn(String(e));
  }
}

// Graceful shutdown: close HTTP server + DB pool
async function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down…`, { module: "Server" });
  if (httpServer) httpServer.close();
  if (pool) await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start();

