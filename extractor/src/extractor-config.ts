import defaultP4kPaths from './data/default-p4k-paths.json' with { type: 'json' };
import type { GameEnv } from './module-registry.js';

export const EXTRACTOR_ENV_FILES = {
  dev: '.env.extractor.dev',
  prod: '.env.extractor.prod',
} as const;

export const EXTRACTOR_DEFAULTS = {
  env: 'live',
  modules: 'all',
  logLevel: 'info',
  ctmConcurrency: 1,
  databaseHost: 'localhost',
  databasePort: 5432,
  databaseName: 'starvis',
  pgPoolMax: 5,
  batchSize: 50,
  keepaliveIntervalMs: 10_000,
  sanityDropThreshold: 0.5,
  galleryDelayMs: 6000,
  galleryRetries: 4,
  galleryRetryDelayMs: 8000,
} as const;

export const DEFAULT_P4K_PATHS = defaultP4kPaths as Record<GameEnv, string[]>;
