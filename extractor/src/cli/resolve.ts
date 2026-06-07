import { existsSync } from 'node:fs';
import type { PoolConfig } from 'pg';
import type { ExtractionModule, GameEnv } from '../extraction-service.js';
import type { Logger } from '../logger.js';
import { formatModules, isP4kFree, needsGameDb, needsRsiDb, type SelectedModules } from './modules.js';
import type { ExtractorCliOptions } from './options.js';

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

export interface RuntimeOptions {
  p4kPath: string;
  env: GameEnv;
  modules: SelectedModules;
  dryRun: boolean;
  gameVersion?: string;
  ctmForce: boolean;
  ctmConcurrency: number;
  requiresP4k: boolean;
  requiresDb: boolean;
  requiresGameDb: boolean;
  requiresRsiDb: boolean;
  pgConfig: PoolConfig;
  dbLabel: string;
}

function autoDetectP4K(env: GameEnv): string | null {
  if (env === 'custom') return null;
  return AUTO_P4K[env].find((path) => existsSync(path)) ?? null;
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

function resolveP4KPath(options: ExtractorCliOptions, logger: Logger): string {
  let p4kPath = options.p4k || getEnvSpecificP4KPath(options.env) || process.env.P4K_PATH || '';
  if (!options.p4k) {
    const detected = autoDetectP4K(options.env);
    if (detected) {
      p4kPath = detected;
      logger.info(`Auto-detected P4K for ${options.env.toUpperCase()}: ${p4kPath}`);
    }
  }
  return p4kPath;
}

function resolvePgConfig(): { pgConfig: PoolConfig; dbLabel: string } {
  if (process.env.DATABASE_URL) {
    return {
      pgConfig: { connectionString: process.env.DATABASE_URL, max: 5 },
      dbLabel: 'DATABASE_URL',
    };
  }

  return {
    pgConfig: {
      host: process.env.DB_HOST || 'localhost',
      port: Number.parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER || '',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'starvis',
      max: 5,
      options: '--idle_in_transaction_session_timeout=0 --statement_timeout=0',
    },
    dbLabel: `${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'starvis'}`,
  };
}

export function resolveRuntimeOptions(options: ExtractorCliOptions, logger: Logger): RuntimeOptions {
  const modules = options.modules.has('all') ? new Set<ExtractionModule | 'all'>(['all']) : options.modules;
  const requiresP4k = !isP4kFree(modules);
  const requiresGameDb = needsGameDb(modules);
  const requiresRsiDb = needsRsiDb(modules);
  const requiresDb = requiresGameDb || requiresRsiDb;
  const p4kPath = resolveP4KPath(options, logger);
  const { pgConfig, dbLabel } = resolvePgConfig();

  if (requiresP4k && !p4kPath) {
    throw new Error('P4K path required. Use --p4k <path>, set P4K_PATH, or use --env live|ptu with RSI installed at the default location.');
  }

  if (requiresP4k && !existsSync(p4kPath)) {
    throw new Error(`P4K file not found: ${p4kPath}`);
  }

  if (requiresDb && !process.env.DATABASE_URL && (!process.env.DB_USER || !process.env.DB_PASSWORD)) {
    throw new Error('DB_USER and DB_PASSWORD (or DATABASE_URL) environment variables are required.');
  }

  logger.debug('Resolved extractor runtime options', {
    env: options.env,
    modules: formatModules(modules),
    requiresP4k,
    requiresGameDb,
    requiresRsiDb,
    dbLabel,
  });

  return {
    p4kPath,
    env: options.env,
    modules,
    dryRun: options.dryRun,
    gameVersion: options.gameVersion,
    ctmForce: options.ctmForce,
    ctmConcurrency: options.ctmConcurrency,
    requiresP4k,
    requiresDb,
    requiresGameDb,
    requiresRsiDb,
    pgConfig,
    dbLabel,
  };
}
