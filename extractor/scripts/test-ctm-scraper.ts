/**
 * Test rapide du scraper CTM — scrape 3 vaisseaux pour valider le fonctionnement.
 *
 * Usage:
 *   npx tsx scripts/test-ctm-scraper.ts
 */

import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(import.meta.dirname, '..', '..', '..', '.env.extractor.dev') });

import { Pool } from 'pg';
import { type ShipToScrape, scrapeShipCtmUrls } from '../src/ctm-scraper.js';

async function main() {
  // 3 vaisseaux connus avec viewer 3D sur RSI
  const testShips: ShipToScrape[] = [
    { className: 'ANVL_Arrow', name: 'Arrow', rsiUrl: '/pledge/ships/anvil-arrow/Arrow' },
    { className: 'ORIG_300i', name: '300i', rsiUrl: '/pledge/ships/origin-300/300i' },
    { className: 'DRAK_Cutlass_Black', name: 'Cutlass Black', rsiUrl: '/pledge/ships/drake-cutlass/Cutlass-Black' },
  ];

  console.log('┌─────────────────────────────────────────────────┐');
  console.log('│  CTM Scraper — Test (3 vaisseaux)               │');
  console.log('└─────────────────────────────────────────────────┘\n');

  const results = await scrapeShipCtmUrls(testShips, (msg) => console.log(' ', msg));

  console.log('\n─── Résultats ────────────────────────────────────');
  if (!results.size) {
    console.log('  ⚠  Aucun CTM trouvé (viewer 3D non déclenché ou RSI indisponible)');
  } else {
    for (const [cls, url] of results) {
      console.log(`  ✅ ${cls}`);
      console.log(`     ${url}`);
    }
  }
  console.log(`\n  Total: ${results.size}/${testShips.length} CTM URL(s) trouvées`);

  // Écriture en DB si au moins 1 résultat
  if (results.size && (process.env.DB_HOST || process.env.DATABASE_URL)) {
    const pgConfig = process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL, max: 2 }
      : {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432', 10),
          user: process.env.DB_USER || '',
          password: process.env.DB_PASSWORD || '',
          database: process.env.DB_NAME || 'starvis',
          max: 2,
        };
    const pool = new Pool(pgConfig);
    try {
      const client = await pool.connect();
      for (const [className, ctmUrl] of results) {
        await client.query('UPDATE game.ships SET ctm_url = $1 WHERE class_name = $2', [ctmUrl, className]);
        console.log(`  💾 DB mis à jour: ${className}`);
      }
      // Vérification
      const { rows } = await client.query<any>('SELECT class_name, ctm_url FROM game.ships WHERE ctm_url IS NOT NULL LIMIT 5');
      console.log('\n  Vérification DB après update:');
      for (const r of rows) console.log(`    ${r.class_name}: ${r.ctm_url}`);
      client.release();
    } catch (e) {
      console.error('  DB error:', (e as Error).message);
    } finally {
      await pool.end();
    }
  }
}

main().catch(console.error);
