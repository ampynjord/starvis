import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Pool } from 'pg';
import { DataForgeService } from '../dataforge-service.js';
import { ExtractionService } from '../extraction-service.js';
import logger, { configureLogger } from '../logger.js';
import { formatModules, VALID_MODULES } from './modules.js';
import { getEnvFileFromArgv, parseCliOptions } from './options.js';
import { resolveRuntimeOptions } from './resolve.js';

const packageDir = resolve(import.meta.dirname, '../..');
const pkg = JSON.parse(readFileSync(resolve(packageDir, 'package.json'), 'utf-8')) as { version: string };

function printModules(): void {
  for (const moduleName of VALID_MODULES) {
    console.log(moduleName);
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  config({ path: resolve(packageDir, getEnvFileFromArgv(argv)) });

  const cli = parseCliOptions(argv, pkg.version);
  configureLogger({
    level: cli.logLevel,
    format: cli.json ? 'json' : 'text',
    color: cli.color,
    quiet: cli.logLevel === 'silent',
  });

  if (cli.listModules) {
    printModules();
    return;
  }

  const cliLogger = logger.child({ module: 'cli' });
  const runtime = resolveRuntimeOptions(cli, cliLogger);

  cliLogger.info(`Mode: ${runtime.env.toUpperCase()} | Modules: ${formatModules(runtime.modules)}${runtime.dryRun ? ' | DRY RUN' : ''}`);

  if (cli.checkConfig) {
    cliLogger.success('Configuration looks valid', {
      env: runtime.env,
      modules: formatModules(runtime.modules),
      p4k: runtime.requiresP4k ? runtime.p4kPath : 'not required',
      db: runtime.requiresDb ? runtime.dbLabel : 'not required',
    });
    return;
  }

  let dfService: DataForgeService | null = null;
  if (runtime.requiresP4k) {
    cliLogger.info(`P4K file: ${runtime.p4kPath}`);
    dfService = await logger.withTimer(
      'Initializing DataForge',
      async () => {
        const service = new DataForgeService(runtime.p4kPath, runtime.gameVersion);
        await service.init();
        return service;
      },
      { module: 'dataforge' },
    );
  }

  if (runtime.dryRun) {
    cliLogger.info('DRY RUN - skipping database write');
    await dfService?.close();
    return;
  }

  let pool: Pool | undefined;
  if (runtime.requiresDb) {
    cliLogger.info(`Connecting to PostgreSQL ${runtime.dbLabel}...`);
    try {
      pool = new Pool(runtime.pgConfig);
      const client = await pool.connect();
      client.release();
      cliLogger.success('PostgreSQL connected', { module: 'db' });
    } catch (error) {
      throw new Error(`Cannot connect to PostgreSQL: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!pool) {
    throw new Error('No PostgreSQL pool available for the selected modules.');
  }

  const extractor = new ExtractionService(pool, dfService);
  const startTime = Date.now();

  try {
    const stats = await extractor.extractAll((msg) => logger.info(msg), {
      modules: runtime.modules,
      env: runtime.env,
      rsiPool: pool,
      ctmForce: runtime.ctmForce,
      ctmConcurrency: runtime.ctmConcurrency,
      shipGalleryDelayMs: runtime.galleryDelayMs,
      shipGalleryRetries: runtime.galleryRetries,
      shipGalleryRetryBaseDelayMs: runtime.galleryRetryDelayMs,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    cliLogger.success(`Extraction complete in ${duration}s [${runtime.env.toUpperCase()}]`);
    cliLogger.info('Extraction summary', {
      manufacturers: stats.manufacturers,
      ships: stats.ships,
      components: stats.components,
      items: stats.items,
      commodities: stats.commodities,
      shops: stats.shops,
      missions: stats.missions,
      craftingRecipes: stats.craftingRecipes,
      locations: stats.locations,
      errors: stats.errors.length,
    });

    for (const error of stats.errors) {
      cliLogger.warn(error);
    }
  } finally {
    await dfService?.close();
    await pool?.end();
  }
}

export function runExtractorCli(argv = process.argv.slice(2)): void {
  main(argv).catch((error) => {
    if (typeof error === 'object' && error && 'exitCode' in error && Number((error as { exitCode: unknown }).exitCode) === 0) {
      process.exit(0);
    }
    if (existsSync(resolve(packageDir, 'package.json'))) {
      logger.fail(error instanceof Error ? error.message : String(error), { module: 'cli' });
    } else {
      console.error('Fatal error:', error);
    }
    process.exit(1);
  });
}
