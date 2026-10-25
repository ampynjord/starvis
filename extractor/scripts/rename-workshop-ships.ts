/**
 * rename-workshop-ships.ts
 *
 * Renomme les restes de nomenclature d'atelier (`Pulse Collector Civ`,
 * `Corsair Exec Military`, …) via localisation jeu puis wiki communautaire.
 * Ne nécessite pas de Data.p4k local — seulement DATABASE_URL + réseau.
 *
 * Usage:
 *   DATABASE_URL=postgresql://… npm run rename:workshop --workspace=@starvis/extractor -- --env live
 */
import 'dotenv/config';
import pg from 'pg';
import { SCRAPER_USER_AGENT } from '../src/config.js';
import type { GameEnv } from '../src/module-registry.js';
import { LocalizationService } from '../src/services/localization-service.js';
import { nameShipsFromCommunityWiki } from '../src/services/sc-wiki-ship-names.js';
import { looksLikeWorkshopShipName, nameRemainingWorkshopShips, nameShipsMissingFromShipMatrix } from '../src/services/ship-naming.js';

const { Pool } = pg;

const FR_INI_URLS = [
  'https://raw.githubusercontent.com/Circuspes/Star-Citizen-FR/master/data/Localization/french_(france)/global.ini',
  'https://raw.githubusercontent.com/GerbyTV/PolyToolSC/main/global.ini',
];
const EN_INI_URLS = ['https://raw.githubusercontent.com/GerbyTV/PolyToolSC/main/global_en.ini'];

async function fetchFirstAvailableText(urls: string[]): Promise<string | null> {
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': SCRAPER_USER_AGENT },
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) {
        const text = await res.text();
        if (text.length > 1000) return text;
      }
    } catch {
      // try next
    }
  }
  return null;
}

async function loadLocalization(): Promise<LocalizationService> {
  const loc = new LocalizationService();
  const [frText, enText] = await Promise.all([fetchFirstAvailableText(FR_INI_URLS), fetchFirstAvailableText(EN_INI_URLS)]);
  if (enText) loc.parseGlobalIni(Buffer.from(enText, 'utf8'), undefined, 'en');
  if (frText) loc.parseGlobalIni(Buffer.from(frText, 'utf8'), undefined, 'fr');
  return loc;
}

function parseEnvArg(): GameEnv {
  const idx = process.argv.indexOf('--env');
  const raw = idx >= 0 ? process.argv[idx + 1] : 'live';
  return (raw === 'ptu' ? 'ptu' : 'live') as GameEnv;
}

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const env = parseEnvArg();
  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    const { rows: before } = await client.query<{ name: string; class_name: string }>(
      `SELECT name, class_name FROM game.ships WHERE env = $1 ORDER BY name`,
      [env],
    );
    const workshopBefore = before.filter((r) => looksLikeWorkshopShipName(r.name));
    console.log(`[rename] ${workshopBefore.length} workshop-like names before (${env})`);

    console.log('[rename] Loading community global.ini…');
    const loc = await loadLocalization();
    console.log(`[rename] Localization loaded: ${loc.isLoaded ? 'yes' : 'no'}`);

    const fromLoc = await nameShipsMissingFromShipMatrix(client, env, loc, (msg) => console.log(`  ${msg}`));
    const fromWiki = await nameShipsFromCommunityWiki(client, env, loc, (msg) => console.log(`  ${msg}`));
    const fromHuman = await nameRemainingWorkshopShips(client, env, (msg) => console.log(`  ${msg}`));

    const { rows: after } = await client.query<{ name: string; class_name: string }>(
      `SELECT name, class_name FROM game.ships WHERE env = $1 ORDER BY name`,
      [env],
    );
    const workshopAfter = after.filter((r) => looksLikeWorkshopShipName(r.name));
    console.log(`[rename] Done — localization=${fromLoc}, wiki=${fromWiki}, humanizer=${fromHuman}`);
    console.log(`[rename] ${workshopAfter.length} workshop-like names remaining`);
    for (const r of workshopAfter) console.log(`  - ${r.name} (${r.class_name})`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
