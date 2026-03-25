#!/usr/bin/env node
/**
 * STARVIS Extractor CLI
 *
 * Standalone tool that reads Star Citizen's P4K file locally,
 * extracts game data (ships, components, paints, shops, missions…)
 * and writes everything to a remote MySQL database.
 *
 * Environment variables (or .env.extractor at project root):
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 *   P4K_PATH (alternative to --p4k flag)
 *   LOG_LEVEL (debug|info|warn|error, default: info)
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(import.meta.dirname, '..', '.env.extractor') });

import { existsSync, readFileSync } from 'node:fs';
import { Command } from 'commander';
import * as mysql from 'mysql2/promise';
import { DataForgeService } from './src/dataforge-service.js';
import { type ExtractionModule, ExtractionService, type GameEnv } from './src/extraction-service.js';
import logger from './src/logger.js';

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf-8'));

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

const VALID_MODULES: ExtractionModule[] = ['ships', 'components', 'items', 'commodities', 'mining', 'missions', 'crafting', 'paints', 'shops'];

// ── CLI ─────────────────────────────────────────────────────
const program = new Command()
  .name('starvis-extractor')
  .description('Star Citizen P4K → MySQL game data extractor')
  .version(pkg.version)
  .option('-p, --p4k <path>', 'path to Data.p4k (overrides auto-detection)')
  .option('-e, --env <env>', 'game environment: live | ptu | eptu | custom', 'live')
  .option('-m, --modules <list>', 'comma-separated modules to extract (default: all)', 'all')
  .option('--dry-run', 'parse P4K and log stats without writing to database')
  .addHelpText(
    'after',
    `
Environment variables:
  DB_HOST       MySQL host (default: localhost)
  DB_PORT       MySQL port (default: 3306)
  DB_USER       MySQL user
  DB_PASSWORD   MySQL password
  DB_NAME       Database name
  P4K_PATH      Alternative to --p4k flag
  LOG_LEVEL     debug | info | warn | error (default: info)

Available modules:
  ${VALID_MODULES.join(', ')}

Examples:
  npx tsx extract.ts --env live
  npx tsx extract.ts --env ptu --modules missions,ships
  npx tsx extract.ts --p4k /path/to/Data.p4k --env custom
  npx tsx extract.ts --dry-run`,
  );

program.parse();
const opts = program.opts<{ p4k?: string; env: string; modules: string; dryRun?: boolean }>();

function parseArgs(): { p4kPath: string; env: GameEnv; modules: Set<ExtractionModule | 'all'>; dryRun: boolean } {
  const envVal = opts.env as GameEnv;
  if (!['live', 'ptu', 'eptu', 'custom'].includes(envVal)) {
    console.error(`Error: --env must be live|ptu|eptu|custom, got "${envVal}"`);
    process.exit(1);
  }

  // Parse modules
  const modParts = opts.modules.split(',').map((s) => s.trim().toLowerCase());
  const invalid = modParts.filter((m) => m !== 'all' && !VALID_MODULES.includes(m as ExtractionModule));
  if (invalid.length) {
    console.error(`Error: Unknown module(s): ${invalid.join(', ')}. Valid: all, ${VALID_MODULES.join(', ')}`);
    process.exit(1);
  }
  const modules = new Set(modParts as (ExtractionModule | 'all')[]);

  // Resolve P4K path
  let p4kPath = opts.p4k || process.env.P4K_PATH || '';
  if (!opts.p4k) {
    const detected = autoDetectP4K(envVal);
    if (detected) {
      p4kPath = detected;
      logger.info(`Auto-detected P4K for ${envVal.toUpperCase()}: ${p4kPath}`);
    }
  }

  if (!p4kPath) {
    console.error(
      'Error: P4K path required. Use --p4k <path>, set P4K_PATH env var, or use --env live|ptu|eptu with RSI installed at default location.',
    );
    process.exit(1);
  }

  return { p4kPath, env: envVal, modules, dryRun: !!opts.dryRun };
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  const { p4kPath, env, modules, dryRun } = parseArgs();
  const onlyAll = modules.has('all');
  const selectedModules = onlyAll ? new Set<ExtractionModule | 'all'>(['all']) : modules;

  logger.info(`Mode: ${env.toUpperCase()} | Modules: ${onlyAll ? 'all' : [...modules].join(', ')}${dryRun ? ' | DRY RUN' : ''}`);

  // Validate P4K file
  if (!existsSync(p4kPath)) {
    console.error(`Error: P4K file not found: ${p4kPath}`);
    process.exit(1);
  }

  logger.info(`P4K file: ${p4kPath}`);

  // Initialize DataForge
  logger.info('Initializing DataForge…');
  const dfService = new DataForgeService(p4kPath);
  await dfService.init();
  logger.info('✅ DataForge initialized');

  if (dryRun) {
    logger.info('DRY RUN — skipping database write');
    await dfService.close();
    return;
  }

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
