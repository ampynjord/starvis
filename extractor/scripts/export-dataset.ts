import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from 'pg';

for (const candidate of ['.env.extractor', '../.env.dev', '.env']) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

interface ExportDatasetSpec {
  filename: string;
  sql: string;
  usesEnv: boolean;
}

const DATASETS: readonly ExportDatasetSpec[] = [
  {
    filename: 'manufacturers.json',
    sql: 'SELECT * FROM game.manufacturers ORDER BY code ASC',
    usesEnv: false,
  },
  {
    filename: 'ships.json',
    sql: `SELECT s.*, sm.name AS matrix_name, sm.focus AS matrix_focus, sm.type AS matrix_type,
                 sm.production_status AS matrix_status, sm.store_url, sm.media_source_url
          FROM game.ships s
          LEFT JOIN rsi.ship_matrix sm ON s.ship_matrix_id = sm.id
          WHERE s.env = $1
          ORDER BY s.class_name ASC`,
    usesEnv: true,
  },
  {
    filename: 'components.json',
    sql: 'SELECT * FROM game.components WHERE env = $1 ORDER BY class_name ASC',
    usesEnv: true,
  },
  {
    filename: 'items.json',
    sql: 'SELECT * FROM game.items WHERE env = $1 ORDER BY class_name ASC',
    usesEnv: true,
  },
  {
    filename: 'commodities.json',
    sql: 'SELECT * FROM game.commodities WHERE env = $1 ORDER BY class_name ASC',
    usesEnv: true,
  },
  {
    filename: 'shops.json',
    sql: 'SELECT * FROM game.shops WHERE env = $1 ORDER BY class_name ASC',
    usesEnv: true,
  },
  {
    filename: 'market-offers.json',
    sql: 'SELECT * FROM game.market_offers WHERE env = $1 ORDER BY entity_uuid ASC, outlet_name ASC',
    usesEnv: true,
  },
  {
    filename: 'mining-elements.json',
    sql: 'SELECT * FROM game.mining_elements WHERE env = $1 ORDER BY class_name ASC',
    usesEnv: true,
  },
  {
    filename: 'mining-compositions.json',
    sql: 'SELECT * FROM game.mining_compositions WHERE env = $1 ORDER BY class_name ASC',
    usesEnv: true,
  },
  {
    filename: 'crafting-recipes.json',
    sql: 'SELECT * FROM game.crafting_recipes WHERE env = $1 ORDER BY class_name ASC',
    usesEnv: true,
  },
  {
    filename: 'missions.json',
    sql: 'SELECT * FROM game.missions WHERE env = $1 ORDER BY class_name ASC',
    usesEnv: true,
  },
  {
    filename: 'mission-brokers.json',
    sql: 'SELECT * FROM game.mission_brokers WHERE env = $1 ORDER BY class_name ASC',
    usesEnv: true,
  },
  {
    filename: 'locations.json',
    sql: 'SELECT * FROM game.locations WHERE env = $1 ORDER BY class_name ASC',
    usesEnv: true,
  },
  {
    filename: 'starmap-systems.json',
    sql: 'SELECT * FROM rsi.starmap_systems ORDER BY code ASC',
    usesEnv: false,
  },
  {
    filename: 'starmap-locations.json',
    sql: 'SELECT * FROM rsi.starmap_locations ORDER BY system_code ASC, name ASC',
    usesEnv: false,
  },
  {
    filename: 'factions.json',
    sql: 'SELECT * FROM game.factions WHERE env = $1 ORDER BY class_name ASC',
    usesEnv: true,
  },
  {
    filename: 'reputations.json',
    sql: 'SELECT * FROM game.reputation_scopes WHERE env = $1 ORDER BY class_name ASC',
    usesEnv: true,
  },
  {
    filename: 'loot-tables.json',
    sql: 'SELECT * FROM game.loot_tables WHERE env = $1 ORDER BY class_name ASC',
    usesEnv: true,
  },
  {
    filename: 'galactapedia.json',
    sql: 'SELECT id, rsi_id, title, slug, type, categories, tags, published_at FROM rsi.galactapedia_entries ORDER BY title ASC',
    usesEnv: false,
  },
  {
    filename: 'translations-fr.json',
    sql: `SELECT uuid, source_type AS domain, class_name, name AS name_fr, value_text AS description_fr, raw_json
          FROM game.game_insights
          WHERE env = $1 AND category = 'translation_fr'
          ORDER BY class_name ASC`,
    usesEnv: true,
  },
];

async function main() {
  const args = process.argv.slice(2);
  const envArgIdx = args.indexOf('--env');
  const outArgIdx = args.indexOf('--out');
  const env = (envArgIdx >= 0 ? args[envArgIdx + 1] : process.env.GAME_ENV) || 'live';

  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ||
      `postgresql://${process.env.DB_USER || 'starvis'}:${process.env.DB_PASSWORD || 'starvis'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'starvis'}`,
  });

  await client.connect();
  try {
    const versionRes = await client
      .query<{ game_version: string | null; extracted_at: string | null }>(
        `SELECT game_version, extracted_at
         FROM meta.extraction_log
         WHERE game_env = $1
         ORDER BY extracted_at DESC
         LIMIT 1`,
        [env],
      )
      .catch(() => ({ rows: [] }));

    const gameVersion = versionRes.rows[0]?.game_version ?? env;
    const outDir = path.resolve(
      process.cwd(),
      outArgIdx >= 0 && args[outArgIdx + 1] ? args[outArgIdx + 1] : path.join('..', 'exports', gameVersion),
    );
    await mkdir(outDir, { recursive: true });

    const counts: Record<string, number> = {};
    for (const ds of DATASETS) {
      try {
        const res = await client.query(ds.sql, ds.usesEnv ? [env] : []);
        counts[ds.filename] = res.rows.length;
        await writeFile(path.join(outDir, ds.filename), `${JSON.stringify(res.rows, null, 2)}\n`, 'utf8');
        console.log(`✅ ${ds.filename}: ${res.rows.length} rows`);
      } catch (err) {
        console.warn(`⚠️ Skipped ${ds.filename}: ${(err as Error).message}`);
      }
    }

    const manifest = {
      generator: 'starvis-open-data-engine',
      env,
      gameVersion,
      exportedAt: new Date().toISOString(),
      extractedAt: versionRes.rows[0]?.extracted_at ?? null,
      sources: ['p4k-dataforge', 'rsi-ship-matrix', 'rsi-starmap', 'rsi-galactapedia', 'sc-wiki', 'uex-2.0', 'sc-fr-localization'],
      files: counts,
    };
    await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`\n📦 Dataset exported to ${outDir}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
