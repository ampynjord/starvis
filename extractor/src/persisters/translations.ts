import { batchUpsert } from './batch.js';
import type { PersistContext } from './context.js';

interface TranslatableEntityRow {
  uuid: string;
  class_name: string;
  name: string | null;
  loc_key?: string | null;
  description?: string | null;
}

const DOMAIN_QUERIES: ReadonlyArray<{
  domain: string;
  sql: string;
}> = [
  { domain: 'ship', sql: 'SELECT uuid, class_name, name, NULL::text AS loc_key, NULL::text AS description FROM game.ships WHERE env = $1' },
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

/**
 * Persist bilingual (EN + FR) translations for all extracted catalog entities
 * into `game.game_insights` (`category = 'translation_fr'`).
 */
export async function saveTranslations(ctx: PersistContext): Promise<number> {
  const { conn, env, loc, onProgress } = ctx;
  if (!loc.isFrenchLoaded || loc.frenchEntryCount === 0) {
    return 0;
  }

  const insightRows: (string | number | null)[][] = [];

  for (const { domain, sql } of DOMAIN_QUERIES) {
    let rows: TranslatableEntityRow[] = [];
    try {
      const res = await conn.query<TranslatableEntityRow>(sql, [env]);
      rows = res.rows;
    } catch {
      continue;
    }

    for (const row of rows) {
      const nameFr =
        (row.loc_key ? loc.resolveKey(row.loc_key, 'fr') : null) ??
        (domain === 'ship' ? loc.resolveShipName(row.class_name, 'fr') : null) ??
        loc.resolveComponentName(row.class_name, 'fr');
      const descFr = loc.resolveDescription(row.class_name, 'fr');
      const nameEn =
        row.name ??
        (row.loc_key ? loc.resolveKey(row.loc_key, 'en') : null) ??
        (domain === 'ship' ? loc.resolveShipName(row.class_name, 'en') : null) ??
        loc.resolveComponentName(row.class_name, 'en');
      const descEn = row.description ?? loc.resolveDescription(row.class_name, 'en');

      if (!nameFr && !descFr) continue;

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
        row.loc_key ?? null,
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

  onProgress?.(`Localization [FR]: persisted ${saved} bilingual entity translations [${env}]`);
  return saved;
}
