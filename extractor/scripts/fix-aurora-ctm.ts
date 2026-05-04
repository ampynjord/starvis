#!/usr/bin/env tsx
/**
 * One-off script: scrape CTM 3D model URL for Aurora Mk2 and write it to the DB.
 *
 * Usage:
 *   cd extractor
 *   npx tsx scripts/fix-aurora-ctm.ts          # uses .env.dev
 *   npx tsx scripts/fix-aurora-ctm.ts --prod    # uses .env.prod
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';

const useProd = process.argv.includes('--prod');
config({ path: resolve(import.meta.dirname, '..', useProd ? '.env.prod' : '.env.dev') });

import { Pool } from 'pg';
import { scrapeShipCtmUrls, type ShipToScrape } from '../src/ctm-scraper.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? 'starvis',
});

async function main() {
  const conn = await pool.connect();
  try {
    // Find Aurora Mk2 base ship — exact class name match, PTU first
    const { rows } = await conn.query<{ class_name: string; name: string; rsi_url: string; env: string }>(
      `SELECT s.class_name, s.name, sm.url AS rsi_url, s.env
       FROM game.ships s
       INNER JOIN rsi.ship_matrix sm ON s.ship_matrix_id = sm.id
       WHERE s.class_name = 'RSI_Aurora_Mk2'
         AND sm.url IS NOT NULL
         AND s.vehicle_category = 'ship'
       ORDER BY CASE s.env WHEN 'ptu' THEN 0 ELSE 1 END
       LIMIT 1`,
    );

    if (!rows.length) {
      console.error('Aurora Mk2 not found in DB with a ship_matrix URL. Try running ship-matrix sync first.');
      process.exit(1);
    }

    const row = rows[0];
    console.log(`Found: ${row.name} (${row.class_name}) — env: ${row.env} — URL: ${row.rsi_url}`);

    const ships: ShipToScrape[] = [{
      className: row.class_name,
      name: row.name,
      rsiUrl: row.rsi_url,
    }];

    console.log('Launching Playwright CTM scrape (headful browser will open)…');
    const ctmMap = await scrapeShipCtmUrls(ships, (msg) => console.log(msg));

    if (!ctmMap.size) {
      console.error('No CTM URL found. The ship may not have a 3D viewer on its RSI page yet.');
      process.exit(1);
    }

    const ctmUrl = ctmMap.get(row.class_name)!;
    console.log(`CTM URL: ${ctmUrl}`);

    // Update all envs (CTM URLs are env-agnostic)
    const result = await conn.query(
      'UPDATE game.ships SET ctm_url = $1 WHERE class_name = $2',
      [ctmUrl, row.class_name],
    );
    console.log(`Updated ${result.rowCount} row(s) in game.ships.`);
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
