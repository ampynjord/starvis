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
import * as mysql from "mysql2/promise";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

import { createRoutes } from "./src/routes.js";
import { GameDataService, ShipMatrixService, initializeSchema } from "./src/services/index.js";
import { DB_CONFIG, logger } from "./src/utils/index.js";

const PORT = process.env.PORT || 3000;

const app = express();
let pool: mysql.Pool | null = null;
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
      description: "Star Citizen Ships & Components API",
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

  // 3. GameDataService (reads from MySQL — fed by standalone extractor)
  gameDataService = new GameDataService(pool);

  // 4. Mount routes
  app.use("/", createRoutes({ pool, shipMatrixService, gameDataService }));

  // 5. Initial sync: Ship Matrix
  try {
    logger.info("Syncing RSI Ship Matrix…", { module: "ShipMatrix" });
    const smResult = await shipMatrixService.sync();
    logger.info(`✅ Ship Matrix synced: ${smResult.synced}/${smResult.total}`, { module: "ShipMatrix" });
  } catch (e) {
    logger.warn("Ship Matrix sync failed", { module: "ShipMatrix" });
    logger.warn(String(e));
  }

  app.listen(PORT, () => logger.info(`✅ Starvis v1.0 listening on :${PORT}`, { module: "Server" }));
}

process.on("SIGINT", async () => {
  logger.info("Shutting down…", { module: "Server" });
  if (pool) await pool.end();
  process.exit(0);
});

start();

