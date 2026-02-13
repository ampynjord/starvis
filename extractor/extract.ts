#!/usr/bin/env node
/**
 * STARVIS Extractor CLI
 *
 * Standalone tool that reads Star Citizen's P4K file locally,
 * extracts game data (ships, components, paints, shops…)
 * and writes everything to a remote MySQL database.
 *
 * Usage:
 *   npx tsx extract.ts --p4k /path/to/Data.p4k
 *
 * Environment variables (or .env file):
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 *   P4K_PATH (alternative to --p4k flag)
 *   LOG_LEVEL (debug|info|warn|error, default: info)
 */
import "dotenv/config";
import { existsSync } from "fs";
import * as mysql from "mysql2/promise";
import { DataForgeService } from "./src/dataforge-service.js";
import { ExtractionService } from "./src/extraction-service.js";
import logger from "./src/logger.js";

// ── Parse CLI args ──────────────────────────────────────────
function parseArgs(): { p4kPath: string } {
  const args = process.argv.slice(2);
  let p4kPath = process.env.P4K_PATH || "";

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--p4k" || args[i] === "-p") && args[i + 1]) {
      p4kPath = args[++i];
    }
    if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
STARVIS Extractor — Star Citizen P4K → MySQL

Usage:
  npx tsx extract.ts --p4k /path/to/Data.p4k

Options:
  --p4k, -p <path>   Path to Star Citizen Data.p4k file
  --help, -h          Show this help

Environment:
  DB_HOST             MySQL host (default: localhost)
  DB_PORT             MySQL port (default: 3306)
  DB_USER             MySQL user
  DB_PASSWORD         MySQL password
  DB_NAME             Database name
  P4K_PATH            Alternative to --p4k flag
  LOG_LEVEL           debug | info | warn | error (default: info)
`);
      process.exit(0);
    }
  }

  if (!p4kPath) {
    console.error("Error: P4K path required. Use --p4k <path> or set P4K_PATH env var.");
    process.exit(1);
  }

  return { p4kPath };
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  const { p4kPath } = parseArgs();

  // Validate P4K file
  if (!existsSync(p4kPath)) {
    console.error(`Error: P4K file not found: ${p4kPath}`);
    process.exit(1);
  }

  logger.info(`P4K file: ${p4kPath}`);

  // Database connection
  const dbConfig = {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER || "",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "",
    waitForConnections: true,
    connectionLimit: 5,
  };

  if (!dbConfig.user || !dbConfig.password || !dbConfig.database) {
    console.error("Error: DB_USER, DB_PASSWORD, and DB_NAME environment variables are required.");
    process.exit(1);
  }

  logger.info(`Connecting to MySQL ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}…`);
  let pool: mysql.Pool;
  try {
    pool = mysql.createPool(dbConfig);
    const conn = await pool.getConnection();
    conn.release();
    logger.info("✅ Database connected");
  } catch (e) {
    console.error(`Error: Cannot connect to database: ${(e as Error).message}`);
    process.exit(1);
  }

  // Initialize DataForge
  logger.info("Initializing DataForge…");
  const dfService = new DataForgeService(p4kPath);
  await dfService.init();
  logger.info("✅ DataForge initialized");

  // Run extraction
  const extractor = new ExtractionService(pool, dfService);
  const startTime = Date.now();

  try {
    const stats = await extractor.extractAll((msg) => logger.info(msg));

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info("═══════════════════════════════════════════");
    logger.info(`✅ Extraction complete in ${duration}s`);
    logger.info(`   Ships:        ${stats.ships}`);
    logger.info(`   Components:   ${stats.components}`);
    logger.info(`   Manufacturers: ${stats.manufacturers}`);
    logger.info(`   Loadout ports: ${stats.loadoutPorts}`);
    logger.info(`   SM linked:    ${stats.shipMatrixLinked}`);
    if (stats.errors.length) {
      logger.warn(`   Errors:       ${stats.errors.length}`);
      for (const e of stats.errors) logger.warn(`     - ${e}`);
    }
    logger.info("═══════════════════════════════════════════");
  } catch (e) {
    logger.error(`Extraction failed: ${(e as Error).message}`);
    process.exit(1);
  } finally {
    await dfService.close();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
