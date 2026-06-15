import { Command, InvalidArgumentError } from 'commander';
import type { LogLevel } from '../logger.js';
import { GAME_ENVS, parseModules, type SelectedModules, VALID_MODULES } from './modules.js';

const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const satisfies readonly LogLevel[];

export interface RawCliOptions {
  p4k?: string;
  env: string;
  modules: string;
  gameVersion?: string;
  dryRun?: boolean;
  prodDb?: boolean;
  ctmForce?: boolean;
  ctmConcurrency: string;
  galleryDelayMs: string;
  galleryRetries: string;
  galleryRetryDelayMs: string;
  logLevel?: string;
  verbose?: boolean;
  quiet?: boolean;
  json?: boolean;
  color?: boolean;
  listModules?: boolean;
  checkConfig?: boolean;
}

export interface ExtractorCliOptions {
  p4k?: string;
  env: (typeof GAME_ENVS)[number];
  modules: SelectedModules;
  gameVersion?: string;
  dryRun: boolean;
  prodDb: boolean;
  ctmForce: boolean;
  ctmConcurrency: number;
  galleryDelayMs: number;
  galleryRetries: number;
  galleryRetryDelayMs: number;
  logLevel: LogLevel;
  json: boolean;
  color: boolean;
  listModules: boolean;
  checkConfig: boolean;
}

function parseEnv(value: string): (typeof GAME_ENVS)[number] {
  if (!GAME_ENVS.includes(value as (typeof GAME_ENVS)[number])) {
    throw new InvalidArgumentError(`must be one of: ${GAME_ENVS.join(', ')}`);
  }
  return value as (typeof GAME_ENVS)[number];
}

function parseLogLevel(value: string): LogLevel {
  if (!LOG_LEVELS.includes(value as LogLevel)) {
    throw new InvalidArgumentError(`must be one of: ${LOG_LEVELS.join(', ')}`);
  }
  return value as LogLevel;
}

function parsePositiveInt(value: string, optionName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError(`${optionName} must be a positive integer`);
  }
  return parsed;
}

export function getEnvFileFromArgv(argv: string[]): string {
  return argv.includes('--prod-db') ? '.env.extractor.prod' : '.env.extractor.dev';
}

function getEnvLogLevel(): LogLevel | undefined {
  if (!process.env.LOG_LEVEL) return undefined;
  try {
    return parseLogLevel(process.env.LOG_LEVEL);
  } catch {
    throw new InvalidArgumentError(`LOG_LEVEL must be one of: ${LOG_LEVELS.join(', ')}`);
  }
}

export function buildProgram(version: string): Command {
  return new Command()
    .name('starvis-extractor')
    .description('Star Citizen P4K -> PostgreSQL game data extractor')
    .version(version)
    .option('-p, --p4k <path>', 'path to Data.p4k (overrides auto-detection)')
    .option('-e, --env <env>', 'game environment: live | ptu | custom', parseEnv, 'live')
    .option('-m, --modules <list>', 'comma-separated modules to extract (default: all)', 'all')
    .option('--game-version <version>', 'override detected game version (e.g. 4.7.2)')
    .option('--dry-run', 'parse P4K and log stats without writing to database')
    .option('--prod-db', 'use the production database configured via SSH tunnel')
    .option('--ctm-force', 'CTM: re-scrape all ships, even those that already have a URL')
    .option('--ctm-concurrency <n>', 'CTM: number of ships to scrape in parallel', '1')
    .option('--gallery-delay-ms <n>', 'ship galleries: delay between RSI pledge pages', '6000')
    .option('--gallery-retries <n>', 'ship galleries: network retries per ship page', '4')
    .option('--gallery-retry-delay-ms <n>', 'ship galleries: base retry backoff delay', '8000')
    .option('--log-level <level>', 'debug | info | warn | error | silent', parseLogLevel)
    .option('--verbose', 'shortcut for --log-level debug')
    .option('--quiet', 'suppress all logs except explicit command output')
    .option('--json', 'emit logs as JSON lines')
    .option('--no-color', 'disable colored text logs')
    .option('--list-modules', 'print available modules and exit')
    .option('--check-config', 'validate CLI, P4K and database configuration without extracting')
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
  LOG_LEVEL     debug | info | warn | error | silent (default: info)

Available modules:
  ${VALID_MODULES.join(', ')}

Examples:
  npx tsx extract.ts --env live
  npx tsx extract.ts --env ptu --modules missions,ships
  npx tsx extract.ts --p4k /path/to/Data.p4k --env custom
  npx tsx extract.ts --modules ctm --ctm-force --ctm-concurrency 4
  npx tsx extract.ts --modules ship-galleries --gallery-delay-ms 10000
  npx tsx extract.ts --list-modules
  npx tsx extract.ts --check-config --modules ctm
  npx tsx extract.ts --dry-run`,
    );
}

export function parseCliOptions(argv: string[], version = '0.0.0'): ExtractorCliOptions {
  const program = buildProgram(version);
  program.exitOverride();
  program.parse(argv, { from: 'user' });
  const raw = program.opts<RawCliOptions>();
  const quiet = !!raw.quiet;
  const logLevel = quiet ? 'silent' : raw.verbose ? 'debug' : ((raw.logLevel as LogLevel | undefined) ?? getEnvLogLevel() ?? 'info');

  return {
    p4k: raw.p4k,
    env: raw.env as ExtractorCliOptions['env'],
    modules: parseModules(raw.modules),
    gameVersion: raw.gameVersion,
    dryRun: !!raw.dryRun,
    prodDb: !!raw.prodDb,
    ctmForce: !!raw.ctmForce,
    ctmConcurrency: parsePositiveInt(raw.ctmConcurrency, '--ctm-concurrency'),
    galleryDelayMs: parsePositiveInt(raw.galleryDelayMs, '--gallery-delay-ms'),
    galleryRetries: parsePositiveInt(raw.galleryRetries, '--gallery-retries'),
    galleryRetryDelayMs: parsePositiveInt(raw.galleryRetryDelayMs, '--gallery-retry-delay-ms'),
    logLevel,
    json: !!raw.json,
    color: raw.color ?? true,
    listModules: !!raw.listModules,
    checkConfig: !!raw.checkConfig,
  };
}
