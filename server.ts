/**
 * STARAPI - Star Citizen Ships API v1.0
 * Entry point with enhanced logging, rate limiting, and authentication
 */
import cors from "cors";
import express from "express";
import { existsSync } from "fs";
import * as mysql from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";

import { createRoutes } from "./src/routes.js";
import { initializeSchema, P4KEnrichmentService, P4KService, ShipService } from "./src/services.js";
import { DB_CONFIG, logger } from "./src/utils/index.js";

const PORT = process.env.PORT || 3000;
const P4K_PATH = process.env.P4K_PATH || "/mnt/c/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
let pool: mysql.Pool | null = null;
let p4kService: P4KService | null = null;
let p4kEnrichmentService: P4KEnrichmentService | null = null;

// ===== MIDDLEWARE =====
app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  credentials: true
}));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// ===== BASIC ROUTES =====
app.get("/", (_, res) => res.json({ 
  name: "Starapi", 
  version: "1.0.0", 
  endpoints: {
    v1: "/api/v1/*",
    legacy: "/api/*",
    admin: "/admin/* (requires X-API-Key header)",
    health: "/health",
    docs: "https://github.com/ampynjord/starapi"
  }
}));

// ===== STARTUP =====
async function start() {
  // Database connection with retry
  for (let i = 0; i < 30; i++) {
    try {
      pool = mysql.createPool(DB_CONFIG);
      const conn = await pool.getConnection();
      await initializeSchema(conn);
      conn.release();
      logger.info("✅ Database ready");
      break;
    } catch (e) {
      logger.warn(`⏳ DB retry ${i + 1}/30...`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  if (!pool) { 
    logger.error("❌ Database failed"); 
    process.exit(1); 
  }

  // P4K service (optional)
  if (existsSync(P4K_PATH)) {
    try {
      logger.info("🔧 Init P4K...");
      p4kService = new P4KService(P4K_PATH);
      await p4kService.init();
      p4kEnrichmentService = new P4KEnrichmentService(pool, p4kService);
      logger.info("✓ P4K ready");
    } catch (e) { 
      logger.info("ℹ️ P4K unavailable"); 
    }
  }

  // Services
  const shipService = new ShipService(pool);

  // Mount all routes
  app.use("/", createRoutes({ pool, shipService, p4kService: p4kService || undefined, p4kEnrichmentService: p4kEnrichmentService || undefined }));

  // Initial sync
  try {
    logger.info("📡 Initial sync...");
    await shipService.syncFromShipMatrix();
  } catch (e) { 
    logger.warn("⚠️ Sync warning:", e); 
  }

  // P4K enrichment (background)
  if (p4kEnrichmentService) {
    p4kEnrichmentService.enrichAllShips(m => logger.info(`[P4K] ${m}`)).catch(e => logger.error("❌ P4K enrichment failed:", e));
  }

  app.listen(PORT, () => logger.info(`🚀 Starapi v1.0 running on http://localhost:${PORT}`));
}

process.on("SIGINT", async () => {
  logger.info("\n🛑 Shutting down...");
  if (p4kService) await p4kService.close();
  if (pool) await pool.end();
  process.exit(0);
});

start();
