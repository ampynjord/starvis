#!/usr/bin/env node
/**
 * STARVIS Extractor CLI
 *
 * Standalone tool that reads Star Citizen's P4K file locally,
 * extracts game data (ships, components, paints, shops, missions…)
 * and writes everything to a remote MySQL database.
 *
 * Environment variables (or .env.extractor.dev at project root):
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD
 *   DB_NAME (optional fallback for --env custom)
 *   P4K_PATH (alternative to --p4k flag)
 *   LOG_LEVEL (debug|info|warn|error, default: info)
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';

// .env files live inside extractor/ (self-contained local tool)
const envFile = process.argv.includes('--prod-db') ? '.env.prod' : '.env.dev';
config({ path: resolve(import.meta.dirname, envFile) });

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

const VALID_MODULES: ExtractionModule[] = [
  // P4K game data
  'ships',
  'components',
  'items',
  'commodities',
  'mining',
  'missions',
  'crafting',
  'paints',
  'shops',
  'locations',
  // Network-only (no P4K)
  'ctm',
  'galactapedia',
  'comm-links',
  'starmap',
  'ship-matrix',
];

/** Modules that don't need the P4K file (network or DB-only) */
const P4K_FREE_MODULES = new Set<ExtractionModule>(['ctm', 'galactapedia', 'comm-links', 'starmap', 'ship-matrix']);

/** Modules that write to the rsi_website database instead of the game DB */
const RSI_MODULES = new Set<ExtractionModule>(['galactapedia', 'comm-links', 'starmap', 'ship-matrix']);

// ── CLI ─────────────────────────────────────────────────────
const program = new Command()
  .name('starvis-extractor')
  .description('Star Citizen P4K → MySQL game data extractor')
  .version(pkg.version)
  .option('-p, --p4k <path>', 'path to Data.p4k (overrides auto-detection)')
  .option('-e, --env <env>', 'game environment: live | ptu | eptu | custom', 'live')
  .option('-m, --modules <list>', 'comma-separated modules to extract (default: all)', 'all')
  .option('--dry-run', 'parse P4K and log stats without writing to database')
  .option('--prod-db', 'Use the production database configured via SSH tunnel')
  .addHelpText(
    'after',
    `
Environment variables:
  DB_HOST       MySQL host (default: localhost)
  DB_PORT       MySQL port (default: 3306)
  DB_USER       MySQL user
  DB_PASSWORD   MySQL password
  DB_NAME       Database name (optional, used as fallback for --env custom)
  P4K_PATH      Alternative to --p4k flag
  LOG_LEVEL     debug | info | warn | error (default: info)

Available modules (P4K game data):
  ships, components, items, commodities, mining, missions, crafting, paints, shops, locations

Network-only modules (no P4K required):
  ctm              — scrape 3D model URLs from RSI website
  ship-matrix      — sync RSI Ship Matrix from RSI website → rsi_website.ship_matrix
  galactapedia     — sync RSI Galactapedia from SC Wiki API → rsi_website.galactapedia
  comm-links       — sync RSI Comm-Links from SC Wiki API  → rsi_website.comm_links
  starmap          — sync RSI Starmap from SC Wiki API     → rsi_website.starmap_locations

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

  // Resolve P4K path — not required when only P4K-free modules (e.g. ctm) are selected
  let p4kPath = opts.p4k || process.env.P4K_PATH || '';
  if (!opts.p4k) {
    const detected = autoDetectP4K(envVal);
    if (detected) {
      p4kPath = detected;
      logger.info(`Auto-detected P4K for ${envVal.toUpperCase()}: ${p4kPath}`);
    }
  }

  if (!p4kPath) {
    if (!isP4kFree(modules)) {
      console.error(
        'Error: P4K path required. Use --p4k <path>, set P4K_PATH env var, or use --env live|ptu|eptu with RSI installed at default location.',
      );
      process.exit(1);
    }
    // P4K-free modules (e.g. ctm) don't need the P4K file
  }

  return { p4kPath, env: envVal, modules, dryRun: !!opts.dryRun };
}

/** True when all requested modules are network/DB-only (no P4K access required) */
function isP4kFree(modules: Set<ExtractionModule | 'all'>): boolean {
  if (modules.has('all')) return false;
  return [...modules].every((m) => P4K_FREE_MODULES.has(m as ExtractionModule));
}

/** True when any of the requested modules need the rsi_website database */
function needsRsiDb(modules: Set<ExtractionModule | 'all'>): boolean {
  if (modules.has('all')) return true;
  return [...modules].some((m) => RSI_MODULES.has(m as ExtractionModule));
}

/** True when any of the requested modules need the game database */
function needsGameDb(modules: Set<ExtractionModule | 'all'>): boolean {
  if (modules.has('all')) return true;
  return [...modules].some((m) => !RSI_MODULES.has(m as ExtractionModule));
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  const { p4kPath, env, modules, dryRun } = parseArgs();
  const onlyAll = modules.has('all');
  const selectedModules = onlyAll ? new Set<ExtractionModule | 'all'>(['all']) : modules;

  logger.info(`Mode: ${env.toUpperCase()} | Modules: ${onlyAll ? 'all' : [...modules].join(', ')}${dryRun ? ' | DRY RUN' : ''}`);

  // Validate P4K file (only required for P4K-based modules)
  if (!isP4kFree(selectedModules)) {
    if (!existsSync(p4kPath)) {
      console.error(`Error: P4K file not found: ${p4kPath}`);
      process.exit(1);
    }
    logger.info(`P4K file: ${p4kPath}`);
  }

  // Initialize DataForge (skipped for P4K-free modules like ctm)
  let dfService: DataForgeService | null = null;
  if (!isP4kFree(selectedModules)) {
    logger.info('Initializing DataForge…');
    dfService = new DataForgeService(p4kPath);
    await dfService.init();
    logger.info('✅ DataForge initialized');
  }

  if (dryRun) {
    logger.info('DRY RUN — skipping database write');
    await dfService?.close();
    return;
  }

  const baseDbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    waitForConnections: true,
    connectionLimit: 5,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    connectTimeout: 60000,
  };

  if (!baseDbConfig.user || !baseDbConfig.password) {
    console.error('Error: DB_USER and DB_PASSWORD environment variables are required.');
    process.exit(1);
  }

  // ── Game DB pool (live/ptu) ──
  let pool: mysql.Pool | undefined;
  if (needsGameDb(selectedModules)) {
    const GAME_DB_MAP: Record<string, string> = { live: 'live', ptu: 'ptu', eptu: 'ptu' };
    const gameDatabaseName = GAME_DB_MAP[env] || process.env.DB_NAME || '';
    if (!gameDatabaseName) {
      console.error('Error: Database name is required. Use --env live|ptu|eptu or set DB_NAME.');
      process.exit(1);
    }
    logger.info(`Connecting to MySQL ${baseDbConfig.host}:${baseDbConfig.port}/${gameDatabaseName}…`);
    try {
      pool = mysql.createPool({ ...baseDbConfig, database: gameDatabaseName });
      const conn = await pool.getConnection();
      conn.release();
      logger.info('✅ Game DB connected');
    } catch (e) {
      console.error(`Error: Cannot connect to game database: ${(e as Error).message}`);
      process.exit(1);
    }
  }

  // ── RSI website DB pool ──
  let rsiPool: mysql.Pool | undefined;
  if (needsRsiDb(selectedModules)) {
    logger.info(`Connecting to MySQL ${baseDbConfig.host}:${baseDbConfig.port}/rsi_website…`);
    try {
      rsiPool = mysql.createPool({ ...baseDbConfig, database: 'rsi_website' });
      const conn = await rsiPool.getConnection();
      conn.release();
      logger.info('✅ RSI website DB connected');
    } catch (e) {
      console.error(`Error: Cannot connect to rsi_website database: ${(e as Error).message}`);
      process.exit(1);
    }
  }

  // Run extraction
  const extractor = new ExtractionService(pool!, dfService);
  const startTime = Date.now();

  try {
    const stats = await extractor.extractAll((msg) => logger.info(msg), { modules: selectedModules, env, rsiPool });

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
    await dfService?.close();
    await pool?.end();
    await rsiPool?.end();
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
