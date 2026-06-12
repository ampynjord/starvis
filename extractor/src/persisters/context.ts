/**
 * Shared context passed to persister functions.
 *
 * Persisters are standalone async functions (extracted from ExtractionService)
 * that write one domain of game data to PostgreSQL within the main extraction
 * transaction.
 */
import type { PoolClient } from 'pg';
import type { DataForgeService } from '../dataforge-service.js';
import type { GameEnv } from '../extraction-service.js';
import type { LocalizationService } from '../localization-service.js';

export interface PersistContext {
  /** Transaction-bound PostgreSQL client */
  conn: PoolClient;
  /** Game environment label (live/ptu/custom) */
  env: GameEnv;
  /** DataForge service — non-null for all P4K modules (not 'ctm') */
  df: DataForgeService;
  /** Localization service (global.ini) */
  loc: LocalizationService;
  /** Optional progress callback */
  onProgress?: (msg: string) => void;
}
