#!/usr/bin/env node
/**
 * STARVIS Extractor CLI
 *
 * Standalone tool that reads Star Citizen's P4K file locally,
 * extracts game data (ships, components, paints, shops, missions…)
 * and writes everything to a remote PostgreSQL database.
 *
 * Environment variables (or .env.extractor.dev at project root):
 *   DATABASE_URL (optional, overrides individual params)
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 *   P4K_PATH (alternative to --p4k flag)
 *   P4K_LIVE_PATH, P4K_PTU_PATH (env-specific paths)
 *   LOG_LEVEL (debug|info|warn|error, default: info)
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';

// .env files live inside extractor/ (self-contained local tool)
const envFile = process.argv.includes('--prod-db') ? '.env.prod' : '.env.dev';
config({ path: resolve(import.meta.dirname, envFile) });

import { existsSync, readFileSync } from 'node:fs';
import { Command } from 'commander';
import { Pool } from 'pg';
import { DataForgeService } from './src/dataforge-service.js';
import { type ExtractionModule, ExtractionService, type GameEnv } from './src/extraction-service.js';
import logger from './src/logger.js';

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf-8'));

// ── Auto-detect P4K paths per environment ─────────────────
const AUTO_P4K: Record<GameEnv, string[]> = {
  live: [
    'C:/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k',
    '/mnt/c/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k',
  ],
  ptu: [
    'C:/Program Files/Roberts Space Industries/StarCitizen/PTU/Data.p4k',
    '/mnt/c/Program Files/Roberts Space Industries/StarCitizen/PTU/Data.p4k',
  ],
  custom: [],
};

function autoDetectP4K(env: GameEnv): string | null {
  if (env === 'custom') return null;
  return AUTO_P4K[env].find((p) => existsSync(p)) ?? null;
}

function getEnvSpecificP4KPath(env: GameEnv): string {
  switch (env) {
    case 'live':
      return process.env.P4K_LIVE_PATH?.trim() || '';
    case 'ptu':
      return process.env.P4K_PTU_PATH?.trim() || '';
    default:
      return '';
  }
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
  .description('Star Citizen P4K → PostgreSQL game data extractor')
  .version(pkg.version)
  .option('-p, --p4k <path>', 'path to Data.p4k (overrides auto-detection)')
  .option('-e, --env <env>', 'game environment: live | ptu | custom', 'live')
  .option('-m, --modules <list>', 'comma-separated modules to extract (default: all)', 'all')
  .option('--dry-run', 'parse P4K and log stats without writing to database')
  .option('--prod-db', 'Use the production database configured via SSH tunnel')
  .addHelpText(
    'after',
    `
Environment variables:
  DATABASE_URL  PostgreSQL connection string (overrides individual params)
  DB_HOST       PostgreSQL host (default: localhost)
  DB_PORT       PostgreSQL port (default: 5432)
  DB_USER       PostgreSQL user
  DB_PASSWORD   PostgreSQL password
  DB_NAME       PostgreSQL database name (default: starvis)
  P4K_PATH      Generic fallback path (alternative to --p4k flag)
  P4K_LIVE_PATH Path used when --env live
  P4K_PTU_PATH  Path used when --env ptu
  LOG_LEVEL     debug | info | warn | error (default: info)

Available modules (P4K game data):
  ships, components, items, commodities, mining, missions, crafting, paints, shops, locations

Network-only modules (no P4K required):
  ctm              — scrape 3D model URLs from RSI website
  ship-matrix      — sync RSI Ship Matrix from RSI website → rsi.ship_matrix
  galactapedia     — sync RSI Galactapedia from SC Wiki API → rsi.galactapedia
  comm-links       — sync RSI Comm-Links from SC Wiki API  → rsi.comm_links
  starmap          — sync RSI Starmap from SC Wiki API     → rsi.starmap_locations

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
  if (!['live', 'ptu', 'custom'].includes(envVal)) {
    console.error(`Error: --env must be live|ptu|custom, got "${envVal}"`);
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
  let p4kPath = opts.p4k || getEnvSpecificP4KPath(envVal) || process.env.P4K_PATH || '';
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
        'Error: P4K path required. Use --p4k <path>, set P4K_PATH env var, or use --env live|ptu with RSI installed at default location.',
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

  // ── PostgreSQL pool (single DB, all schemas: game / rsi / meta) ──
  let pool: Pool | undefined;

  const pgConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, max: 5 }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        user: process.env.DB_USER || '',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'starvis',
        max: 5,
      };

  if (!process.env.DATABASE_URL && (!process.env.DB_USER || !process.env.DB_PASSWORD)) {
    console.error('Error: DB_USER and DB_PASSWORD (or DATABASE_URL) environment variables are required.');
    process.exit(1);
  }

  if (needsGameDb(selectedModules) || needsRsiDb(selectedModules)) {
    logger.info(
      `Connecting to PostgreSQL ${process.env.DATABASE_URL ? '(DATABASE_URL)' : `${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'starvis'}`}…`,
    );
    try {
      pool = new Pool(pgConfig);
      const client = await pool.connect();
      client.release();
      logger.info('✅ PostgreSQL connected');
    } catch (e) {
      console.error(`Error: Cannot connect to PostgreSQL: ${(e as Error).message}`);
      process.exit(1);
    }
  }

  // Run extraction
  const extractor = new ExtractionService(pool!, dfService);
  const startTime = Date.now();

  try {
    const stats = await extractor.extractAll((msg) => logger.info(msg), { modules: selectedModules, env, rsiPool: pool });

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
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
