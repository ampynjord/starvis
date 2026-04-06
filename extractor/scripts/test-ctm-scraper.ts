/**
 * Test rapide du scraper CTM — scrape 3 vaisseaux pour valider le fonctionnement.
 *
 * Usage:
 *   npx tsx scripts/test-ctm-scraper.ts
 */

import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(import.meta.dirname, '..', '..', '..', '.env.extractor.dev') });

import * as mysql from 'mysql2/promise';
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
  if (results.size && process.env.DB_HOST) {
    const pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || '',
      password: process.env.DB_PASSWORD || '',
      database: 'live',
    });
    try {
      const conn = await pool.getConnection();
      for (const [className, ctmUrl] of results) {
        await conn.execute('UPDATE ships SET ctm_url = ? WHERE class_name = ?', [ctmUrl, className]);
        console.log(`  💾 DB mis à jour: ${className}`);
      }
      conn.release();
      // Vérification
      const [rows] = await conn.execute<any[]>('SELECT class_name, ctm_url FROM ships WHERE ctm_url IS NOT NULL LIMIT 5');
      console.log('\n  Vérification DB après update:');
      for (const r of rows) console.log(`    ${r.class_name}: ${r.ctm_url}`);
    } catch (e) {
      console.error('  DB error:', (e as Error).message);
    } finally {
      await pool.end();
    }
  }
}

main().catch(console.error);
