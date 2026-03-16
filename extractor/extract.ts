#!/usr/bin/env node
/**
 * STARVIS Extractor CLI
 *
 * Standalone tool that reads Star Citizen's P4K file locally,
 * extracts game data (ships, components, paints, shops, missions…)
 * and writes everything to a remote MySQL database.
 *
 * Usage:
 *   npx tsx extract.ts --p4k /path/to/Data.p4k
 *   npx tsx extract.ts --env live
 *   npx tsx extract.ts --env ptu --only missions,ships
 *
 * Environment variables (or .env file):
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 *   P4K_PATH (alternative to --p4k flag)
 *   LOG_LEVEL (debug|info|warn|error, default: info)
 */
import 'dotenv/config';
import { existsSync } from 'node:fs';
import * as mysql from 'mysql2/promise';
import { DataForgeService } from './src/dataforge-service.js';
import { type ExtractionModule, ExtractionService, type GameEnv } from './src/extraction-service.js';
import logger from './src/logger.js';

// ── Auto-detect P4K paths per environment ─────────────────
const AUTO_P4K: Record<GameEnv, string[]> = {
  live: [
    'C:/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k',
    '/mnt/c/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k',
    `${process.env.HOME}/Library/Application Support/Roberts Space Industries/StarCitizen/LIVE/Data.p4k`,
  ],
  ptu: [
    'C:/Program Files/Roberts Space Industries/StarCitizen/PTU/Data.p4k',
    '/mnt/c/Program Files/Roberts Space Industries/StarCitizen/PTU/Data.p4k',
    `${process.env.HOME}/Library/Application Support/Roberts Space Industries/StarCitizen/PTU/Data.p4k`,
  ],
  eptu: [
    'C:/Program Files/Roberts Space Industries/StarCitizen/EPTU/Data.p4k',
    '/mnt/c/Program Files/Roberts Space Industries/StarCitizen/EPTU/Data.p4k',
    `${process.env.HOME}/Library/Application Support/Roberts Space Industries/StarCitizen/EPTU/Data.p4k`,
  ],
  custom: [],
};

function autoDetectP4K(env: GameEnv): string | null {
  if (env === 'custom') return null;
  return AUTO_P4K[env].find((p) => existsSync(p)) ?? null;
}

const VALID_MODULES: ExtractionModule[] = ['ships', 'components', 'items', 'commodities', 'mining', 'missions', 'paints', 'shops'];

// ── Parse CLI args ──────────────────────────────────────────
function parseArgs(): { p4kPath: string; env: GameEnv; modules: Set<ExtractionModule | 'all'> } {
  const args = process.argv.slice(2);
  let p4kPath = process.env.P4K_PATH || '';
  let env: GameEnv = 'live';
  let modules: Set<ExtractionModule | 'all'> = new Set(['all']);

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--p4k' || args[i] === '-p') && args[i + 1]) {
      p4kPath = args[++i];
    } else if (args[i] === '--env' && args[i + 1]) {
      const v = args[++i] as GameEnv;
      if (!['live', 'ptu', 'eptu', 'custom'].includes(v)) {
        console.error(`Error: --env must be live|ptu|eptu|custom, got "${v}"`);
        process.exit(1);
      }
      env = v;
    } else if (args[i] === '--only' && args[i + 1]) {
      const parts = args[++i].split(',').map((s) => s.trim().toLowerCase());
      const invalid = parts.filter((m) => m !== 'all' && !VALID_MODULES.includes(m as ExtractionModule));
      if (invalid.length) {
        console.error(`Error: Unknown module(s): ${invalid.join(', ')}. Valid: all,${VALID_MODULES.join(',')}`);
        process.exit(1);
      }
      modules = new Set(parts as (ExtractionModule | 'all')[]);
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
STARVIS Extractor — Star Citizen P4K → MySQL

Usage:
  npx tsx extract.ts [options]

Options:
  --p4k, -p <path>      Path to Data.p4k file (overrides --env auto-detection)
  --env <env>           Game environment: live | ptu | eptu | custom  (default: live)
                        Auto-detects P4K from RSI install dir.
  --only <modules>      Comma-separated list of modules to extract (default: all)
                        Modules: ${VALID_MODULES.join(', ')}
                        Example: --only missions,ships
  --help, -h            Show this help

Environment:
  DB_HOST               MySQL host (default: localhost)
  DB_PORT               MySQL port (default: 3306)
  DB_USER               MySQL user
  DB_PASSWORD           MySQL password
  DB_NAME               Database name
  P4K_PATH              Alternative to --p4k flag
  LOG_LEVEL             debug | info | warn | error (default: info)

Examples:
  npx tsx extract.ts --env live
  npx tsx extract.ts --env ptu --only missions
  npx tsx extract.ts --p4k /path/to/Data.p4k --env custom
`);
      process.exit(0);
    }
  }

  // Auto-detect P4K path from environment if not specified
  if (!p4kPath) {
    const detected = autoDetectP4K(env);
    if (detected) {
      p4kPath = detected;
      logger.info(`Auto-detected P4K for ${env.toUpperCase()}: ${p4kPath}`);
    }
  }

  if (!p4kPath) {
    console.error(
      `Error: P4K path required. Use --p4k <path>, set P4K_PATH env var, or use --env live|ptu|eptu with RSI installed at default location.`,
    );
    process.exit(1);
  }

  return { p4kPath, env, modules };
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  const { p4kPath, env, modules } = parseArgs();
  const onlyAll = modules.has('all');
  const selectedModules = onlyAll ? new Set<ExtractionModule | 'all'>(['all']) : modules;

  logger.info(`Mode: ${env.toUpperCase()} | Modules: ${onlyAll ? 'all' : [...modules].join(', ')}`);

  // Validate P4K file
  if (!existsSync(p4kPath)) {
    console.error(`Error: P4K file not found: ${p4kPath}`);
    process.exit(1);
  }

  logger.info(`P4K file: ${p4kPath}`);

  // Database connection
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || '',
    waitForConnections: true,
    connectionLimit: 5,
    // Keep TCP connection alive during long extractions (30+ minutes)
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    connectTimeout: 60000,
  };

  if (!dbConfig.user || !dbConfig.password || !dbConfig.database) {
    console.error('Error: DB_USER, DB_PASSWORD, and DB_NAME environment variables are required.');
    process.exit(1);
  }

  logger.info(`Connecting to MySQL ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}…`);
  let pool: mysql.Pool;
  try {
    pool = mysql.createPool(dbConfig);
    const conn = await pool.getConnection();
    conn.release();
    logger.info('✅ Database connected');
  } catch (e) {
    console.error(`Error: Cannot connect to database: ${(e as Error).message}`);
    process.exit(1);
  }

  // Initialize DataForge
  logger.info('Initializing DataForge…');
  const dfService = new DataForgeService(p4kPath);
  await dfService.init();
  logger.info('✅ DataForge initialized');

  // Run extraction
  const extractor = new ExtractionService(pool, dfService);
  const startTime = Date.now();

  try {
    const stats = await extractor.extractAll((msg) => logger.info(msg), { modules: selectedModules, env });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info('═══════════════════════════════════════════');
    logger.info(`✅ Extraction complete in ${duration}s [${env.toUpperCase()}]`);
    logger.info(`   Ships:        ${stats.ships}`);
    logger.info(`   Components:   ${stats.components}`);
    logger.info(`   Manufacturers: ${stats.manufacturers}`);
    logger.info(`   Loadout ports: ${stats.loadoutPorts}`);
    logger.info(`   SM linked:    ${stats.shipMatrixLinked}`);
    logger.info(`   Missions:     ${stats.missions}`);
    if (stats.errors.length) {
      logger.warn(`   Errors:       ${stats.errors.length}`);
      for (const e of stats.errors) logger.warn(`     - ${e}`);
    }
    logger.info('═══════════════════════════════════════════');
  } catch (e) {
    logger.error(`Extraction failed: ${(e as Error).message}`);
    process.exit(1);
  } finally {
    await dfService.close();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
