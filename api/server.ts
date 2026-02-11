/**
 * STARVIS v1.0 - Star Citizen Ships & Components API
 *
 * Architecture:
 *   ship_matrix table    ← ShipMatrixService  ← RSI Ship Matrix API
 *   ships/components/etc ← GameDataService     ← DataForgeService ← P4K
 *
 * Features: Pagination, ETag caching, CSV export, Rate limiting, Swagger docs
 */
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import { existsSync } from "fs";
import * as mysql from "mysql2/promise";
import path from "path";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { fileURLToPath } from "url";

import { createRoutes } from "./src/routes.js";
import { DataForgeService, GameDataService, ShipMatrixService, initializeSchema } from "./src/services/index.js";
import { DB_CONFIG, logger } from "./src/utils/index.js";

const PORT = process.env.PORT || 3000;
const P4K_PATH = process.env.P4K_PATH || "/game/Data.p4k";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
let pool: mysql.Pool | null = null;
let dfService: DataForgeService | null = null;
let gameDataService: GameDataService | null = null;

// ===== MIDDLEWARE =====
app.use(cors({ origin: process.env.CORS_ORIGIN || "*", credentials: true }));
app.use(express.json());

// Rate limiting – 200 req / 15 min per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || "200"),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests, please try again later" },
});
app.use("/api", limiter);

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
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Starvis",
      version: "1.0.0",
      description: "Star Citizen Ships & Components API – powered by P4K/DataForge",
    },
    servers: [{ url: `http://localhost:${PORT}` }],
  },
  apis: ["./src/routes.ts", "./src/routes.js"],
});
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

  // 3. DataForge / P4K service (optional)
  if (existsSync(P4K_PATH)) {
    try {
      logger.info("Initializing DataForge…", { module: "P4K" });
      dfService = new DataForgeService(P4K_PATH);
      await dfService.init();
      gameDataService = new GameDataService(pool, dfService);
      logger.info("✅ DataForge ready", { module: "P4K" });
    } catch (e) {
      logger.warn("P4K/DataForge unavailable", { module: "P4K" });
      logger.warn(String(e));
    }
  } else {
    logger.info("P4K not found — game data endpoints disabled", { module: "P4K" });
  }

  // 4. Mount routes
  app.use("/", createRoutes({
    pool,
    shipMatrixService,
    gameDataService: gameDataService || undefined,
  }));

  // 5. Initial sync: Ship Matrix
  try {
    logger.info("Syncing RSI Ship Matrix…", { module: "ShipMatrix" });
    const smResult = await shipMatrixService.sync();
    logger.info(`✅ Ship Matrix synced: ${smResult.synced}/${smResult.total}`, { module: "ShipMatrix" });
  } catch (e) {
    logger.warn("Ship Matrix sync failed", { module: "ShipMatrix" });
    logger.warn(String(e));
  }

  // 6. Background: extract game data from P4K
  if (gameDataService) {
    (async () => {
      try {
        const stats = await gameDataService!.extractAll(msg => logger.info(msg, { module: "P4K" }));
        logger.info(`✅ Game data ready: ${stats.ships} ships, ${stats.components} components, ${stats.manufacturers} manufacturers`, { module: "P4K" });
      } catch (e) {
        logger.error("Game data extraction failed", { module: "P4K" });
        logger.error(String(e));
      }
    })();
  }

  app.listen(PORT, () => logger.info(`✅ Starvis v1.0 listening on :${PORT}`, { module: "Server" }));
}

process.on("SIGINT", async () => {
  logger.info("Shutting down…", { module: "Server" });
  if (dfService) await dfService.close();
  if (pool) await pool.end();
  process.exit(0);
});

start();

