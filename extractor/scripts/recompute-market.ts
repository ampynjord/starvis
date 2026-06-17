/**
 * One-shot script: recompute ship market summaries from existing shop_inventory data.
 * Run this after a ships-only extraction to restore price data without re-extracting shops.
 *
 * Usage (prod): npx tsx scripts/recompute-market.ts --prod-db
 *          (ptu): npx tsx scripts/recompute-market.ts --ptu
 */
import { Pool } from 'pg';
import { updateShipMarketSummaries } from '../src/persisters/ship-market-summaries.js';
import type { PersistContext } from '../src/persisters/context.js';
import { resolveRuntimeOptions } from '../src/cli/resolve.js';
import { parseCliOptions } from '../src/cli/options.js';
import logger from '../src/logger.js';

const opts = resolveRuntimeOptions(parseCliOptions(process.argv.slice(2)), logger);
const env = opts.env;

const pool = new Pool(opts.pgConfig);
const client = await pool.connect();

try {
  logger.info(`Recomputing ship market summaries for env='${env}'…`);
  const ctx = { conn: client, env } as unknown as PersistContext;
  const stats = await updateShipMarketSummaries(ctx);
  logger.info(
    `Done: ${stats.ships} ships processed — ${stats.purchasable} purchasable, ${stats.rentable} rentable, ${stats.noTerminalOffer} without offer`,
  );
} finally {
  client.release();
  await pool.end();
}
