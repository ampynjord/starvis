/**
 * sync-community-and-rsi.ts
 *
 * Synchronizes external official RSI & active community data into PostgreSQL without requiring a local Data.p4k:
 *   1. Bilingual EN/FR Localization (SC-FR Circuspes / PolyToolSC global.ini -> game.game_insights 'translation_fr')
 *   2. UEX Corp 2.0 Market, Terminals & Refineries (saveUexMarket -> game.uex_market_prices, game.uex_terminals, game.uex_vehicle_prices)
 *   3. Official RSI Roadmap (Release View) & RSI Server Status (-> game.game_insights 'rsi_roadmap', 'rsi_status')
 */
import 'dotenv/config';
import pg from 'pg';
import { SCRAPER_USER_AGENT } from '../src/config.js';
import { batchUpsert } from '../src/persisters/batch.js';
import { saveShipCtmModels } from '../src/persisters/ctm.js';
import { saveOfficialShipGalleries } from '../src/persisters/ship-galleries.js';
import { updateShipMarketSummaries } from '../src/persisters/ship-market-summaries.js';
import { saveUexMarket } from '../src/persisters/uex.js';
import { LocalizationService } from '../src/services/localization-service.js';
import { RsiSyncService } from '../src/services/rsi-sync-service.js';

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL;

const FR_INI_URLS = [
  'https://raw.githubusercontent.com/Circuspes/Star-Citizen-FR/master/data/Localization/french_(france)/global.ini',
  'https://raw.githubusercontent.com/GerbyTV/PolyToolSC/main/global.ini',
];

const EN_INI_URLS = ['https://raw.githubusercontent.com/GerbyTV/PolyToolSC/main/global_en.ini'];

function parseGlobalIniText(content: string): Map<string, string> {
  const map = new Map<string, string>();
  const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const rawKey = line.slice(0, eqIdx).trim();
    const commaIdx = rawKey.indexOf(',');
    const key = (commaIdx !== -1 ? rawKey.slice(0, commaIdx) : rawKey).toLowerCase();
    const val = line
      .slice(eqIdx + 1)
      .replace(/\\n/g, '\n')
      .trim();
    if (key && val) map.set(key, val);
  }
  return map;
}

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
      // try next fallback URL
    }
  }
  return null;
}

async function syncFrenchTranslations(pool: pg.Pool, env = 'live'): Promise<number> {
  console.log('  [translations] Fetching community French & English global.ini...');
  const [frText, enText] = await Promise.all([fetchFirstAvailableText(FR_INI_URLS), fetchFirstAvailableText(EN_INI_URLS)]);
  if (!frText) {
    console.warn('  [translations] Could not download French global.ini');
    return 0;
  }

  const loc = new LocalizationService();
  if (enText) loc.parseGlobalIni(Buffer.from(enText, 'utf8'), undefined, 'en');
  loc.parseGlobalIni(Buffer.from(frText, 'utf8'), undefined, 'fr');

  const frByKey = parseGlobalIniText(frText);
  const enByKey = enText ? parseGlobalIniText(enText) : new Map<string, string>();

  // Reverse index: normalized English value -> first matching key that has a French translation
  const enValueToFr = new Map<string, { key: string; fr: string; en: string }>();
  for (const [key, enVal] of enByKey) {
    const frVal = frByKey.get(key);
    if (!frVal) continue;
    const norm = enVal.trim().toLowerCase();
    if (norm.length >= 2 && !enValueToFr.has(norm)) {
      enValueToFr.set(norm, { key, fr: frVal, en: enVal });
    }
  }

  const resolveReverse = (raw: string | null | undefined): { en: string; fr: string; key: string } | null => {
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('@')) {
      const k = trimmed.slice(1).toLowerCase();
      const fr = frByKey.get(k);
      if (fr) return { en: enByKey.get(k) ?? trimmed, fr, key: k };
    }
    return enValueToFr.get(trimmed.toLowerCase()) ?? null;
  };

  const DOMAIN_QUERIES: ReadonlyArray<{ domain: string; sql: string }> = [
    {
      domain: 'ship',
      sql: 'SELECT uuid, class_name, name, NULL::text AS loc_key, NULL::text AS description FROM game.ships WHERE env = $1',
    },
    {
      domain: 'component',
      sql: 'SELECT uuid, class_name, name, NULL::text AS loc_key, NULL::text AS description FROM game.components WHERE env = $1',
    },
    {
      domain: 'item',
      sql: 'SELECT uuid, class_name, name, NULL::text AS loc_key, NULL::text AS description FROM game.items WHERE env = $1',
    },
    {
      domain: 'commodity',
      sql: 'SELECT uuid, class_name, name, NULL::text AS loc_key, NULL::text AS description FROM game.commodities WHERE env = $1',
    },
    {
      domain: 'mission',
      sql: 'SELECT uuid, class_name, title AS name, NULL::text AS loc_key, description FROM game.missions WHERE env = $1',
    },
    {
      domain: 'crafting',
      sql: 'SELECT uuid, class_name, name, NULL::text AS loc_key, NULL::text AS description FROM game.crafting_recipes WHERE env = $1',
    },
    {
      domain: 'location',
      sql: 'SELECT uuid, class_name, name, loc_key, description FROM game.locations WHERE env = $1',
    },
    {
      domain: 'mining',
      sql: 'SELECT uuid, class_name, name, NULL::text AS loc_key, NULL::text AS description FROM game.mining_elements WHERE env = $1',
    },
    {
      domain: 'faction',
      sql: 'SELECT uuid, class_name, name, NULL::text AS loc_key, description FROM game.factions WHERE env = $1',
    },
  ];

  const conn = await pool.connect();
  try {
    const insightRows: (string | number | null)[][] = [];
    const seenUuids = new Set<string>();

    for (const { domain, sql } of DOMAIN_QUERIES) {
      let rows: { uuid: string; class_name: string; name: string | null; loc_key: string | null; description: string | null }[] = [];
      try {
        const res = await conn.query(sql, [env]);
        rows = res.rows;
      } catch {
        continue;
      }

      for (const row of rows) {
        if (!row.uuid || seenUuids.has(row.uuid)) continue;
        const revName = resolveReverse(row.name);
        const revDesc = resolveReverse(row.description);

        const nameFr =
          (row.loc_key ? loc.resolveKey(row.loc_key, 'fr') : null) ??
          (domain === 'ship' ? loc.resolveShipName(row.class_name, 'fr') : null) ??
          loc.resolveComponentName(row.class_name, 'fr') ??
          revName?.fr ??
          null;
        const descFr = loc.resolveDescription(row.class_name, 'fr') ?? revDesc?.fr ?? null;
        if (!nameFr && !descFr) continue;

        const nameEn =
          row.name ??
          (row.loc_key ? loc.resolveKey(row.loc_key, 'en') : null) ??
          (domain === 'ship' ? loc.resolveShipName(row.class_name, 'en') : null) ??
          loc.resolveComponentName(row.class_name, 'en');
        const descEn = row.description ?? loc.resolveDescription(row.class_name, 'en');

        seenUuids.add(row.uuid);
        insightRows.push([
          row.uuid,
          env,
          'translation_fr',
          domain,
          row.class_name,
          nameFr ?? nameEn ?? row.class_name,
          'fr',
          row.class_name,
          row.uuid,
          null,
          null,
          row.loc_key ?? revName?.key ?? null,
          null,
          descFr ?? null,
          null,
          JSON.stringify({
            lang: 'fr',
            domain,
            name_en: nameEn ?? null,
            name_fr: nameFr ?? null,
            description_en: descEn ?? null,
            description_fr: descFr ?? null,
          }),
        ]);
      }
    }

    if (!insightRows.length) return 0;

    await conn.query(`DELETE FROM game.game_insights WHERE env = $1 AND category = 'translation_fr'`, [env]);
    const saved = await batchUpsert(
      conn,
      `INSERT INTO game.game_insights
         (uuid, env, category, source_type, class_name, name, subtype,
          related_class, related_uuid, location_hint, faction, reputation_key,
          value_numeric, value_text, p4k_path, raw_json)`,
      `(uuid, env, category) DO UPDATE SET
         source_type=EXCLUDED.source_type,
         class_name=EXCLUDED.class_name,
         name=EXCLUDED.name,
         subtype=EXCLUDED.subtype,
         related_class=EXCLUDED.related_class,
         related_uuid=EXCLUDED.related_uuid,
         reputation_key=EXCLUDED.reputation_key,
         value_text=EXCLUDED.value_text,
         raw_json=EXCLUDED.raw_json,
         extracted_at=now()`,
      16,
      insightRows,
    );
    console.log(`  [translations] ✓ ${saved} entities localized (EN + FR)`);
    return saved;
  } finally {
    conn.release();
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const runAll = args.size === 0 || args.has('--all');
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    if (runAll || args.has('--translations')) {
      await syncFrenchTranslations(pool, 'live');
    }
    if (runAll || args.has('--uex')) {
      const conn = await pool.connect();
      try {
        await saveUexMarket(conn, 'live', (m) => console.log(`  [uex] ${m}`));
        const summary = await updateShipMarketSummaries({ conn, env: 'live' });
        console.log(`  [uex] Market summaries updated: ${summary.purchasable} purchasable, ${summary.rentable} rentable`);
      } finally {
        conn.release();
      }
    }
    if (runAll || args.has('--rsi')) {
      const rsi = new RsiSyncService(pool);
      await rsi.syncShipMatrix((m) => console.log(m));
      await rsi.syncStarmap((m) => console.log(m));
      await rsi.syncGalactapedia((m) => console.log(m));
      await rsi.syncCommLinks((m) => console.log(m));
      await rsi.syncRoadmap((m) => console.log(m));
      await rsi.syncServerStatus((m) => console.log(m));
    }
    if (args.has('--galleries')) {
      const conn = await pool.connect();
      try {
        await saveOfficialShipGalleries(conn, { concurrency: 2 }, (m) => console.log(`  [galleries] ${m}`));
      } finally {
        conn.release();
      }
    }
    if (args.has('--ctm')) {
      const conn = await pool.connect();
      try {
        await saveShipCtmModels(conn, 'live', { concurrency: 3 }, (m) => console.log(`  [ctm] ${m}`));
      } finally {
        conn.release();
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[sync-community-and-rsi] Fatal error:', err);
  process.exit(1);
});
