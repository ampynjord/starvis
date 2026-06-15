import { existsSync } from 'node:fs';
import dotenv from 'dotenv';
import { Client } from 'pg';

type AuditRow = Record<string, unknown>;

const argv = process.argv.slice(2);

function argValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function firstExisting(paths: string[]): string | undefined {
  return paths.find((path) => existsSync(path));
}

const envFile = argv.includes('--prod-db')
  ? firstExisting(['extractor/.env.extractor.prod', '.env.extractor.prod'])
  : firstExisting(['extractor/.env.extractor.dev', '.env.extractor.dev', '.env.dev']);

if (envFile) dotenv.config({ path: envFile, override: true });
dotenv.config();

function env(name: string, fallback?: string): string {
  return process.env[name] ?? fallback ?? '';
}

function numberEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function rows(client: Client, sql: string, params: unknown[] = []): Promise<AuditRow[]> {
  const result = await client.query(sql, params);
  return result.rows;
}

async function main() {
  const envName = argValue('--env') ?? process.env.STARVIS_ENV ?? 'live';
  const client = new Client({
    host: env('DB_HOST', '127.0.0.1'),
    port: numberEnv('DB_PORT', numberEnv('DB_EXTERNAL_PORT', 5432)),
    database: env('DB_NAME', 'starvis'),
    user: env('DB_USER', 'starvis_user'),
    password: env('DB_PASSWORD', 'starvis_pass'),
  });

  await client.connect();
  try {
    const parentSummary = await rows(
      client,
      `WITH parent_status AS (
          SELECT l.type, l.parent_uuid, p.uuid AS parent_found
          FROM game.locations l
          LEFT JOIN game.locations p ON p.uuid = l.parent_uuid AND p.env = l.env
          WHERE l.env = $1
        )
        SELECT type, COUNT(*)::int AS total, COUNT(parent_uuid)::int AS with_parent,
          COUNT(parent_uuid) FILTER (WHERE parent_found IS NULL)::int AS broken_parent_refs
        FROM parent_status
        GROUP BY type
        ORDER BY total DESC`,
      [envName],
    );
    const missingParents = await rows(
      client,
      `SELECT l.uuid, l.name, l.type, l.system_code, l.parent_uuid
         FROM game.locations l
         LEFT JOIN game.locations p ON p.uuid = l.parent_uuid AND p.env = l.env
         WHERE l.env = $1 AND l.parent_uuid IS NOT NULL AND p.uuid IS NULL
         ORDER BY l.type, l.name
         LIMIT 100`,
      [envName],
    );
    const shopSummary = await rows(
      client,
      `SELECT COUNT(*)::int AS total,
          COUNT(location_uuid)::int AS linked_location_uuid,
          COUNT(canonical_location_key)::int AS linked_loc_key,
          COUNT(*) FILTER (WHERE location_uuid IS NULL AND canonical_location_key IS NULL)::int AS unlinked
         FROM game.shops
         WHERE env = $1`,
      [envName],
    );
    const unlinkedShops = await rows(
      client,
      `SELECT s.id, s.name, s.shop_type, s.location_slug, s.location, s.system, s.planet_moon, s.city,
          COUNT(si.id)::int AS inventory_rows
         FROM game.shops s
         LEFT JOIN game.shop_inventory si ON si.shop_id = s.id
         WHERE s.env = $1 AND s.location_uuid IS NULL
         GROUP BY s.id
         ORDER BY inventory_rows DESC, s.name
         LIMIT 100`,
      [envName],
    );
    const inventorySummary = await rows(
      client,
      `SELECT inventory_kind, COUNT(*)::int AS rows,
          COUNT(*) FILTER (WHERE confidence < 1)::int AS unmatched_or_low_confidence,
          COUNT(*) FILTER (
            WHERE base_price IS NULL AND sell_price IS NULL
              AND rental_price_1d IS NULL AND rental_price_3d IS NULL
              AND rental_price_7d IS NULL AND rental_price_30d IS NULL
          )::int AS rows_without_price
         FROM game.shop_inventory
         GROUP BY inventory_kind
         ORDER BY rows DESC`,
    );
    const placesWithoutShops = await rows(
      client,
      `SELECT l.uuid, l.system_code, l.name, l.type, COUNT(s.id)::int AS shops
         FROM game.locations l
         LEFT JOIN game.shops s ON s.env = l.env AND (s.location_uuid = l.uuid OR s.canonical_location_key = l.loc_key)
         WHERE l.env = $1 AND l.type IN ('landing_zone', 'station', 'rest_stop', 'outpost')
         GROUP BY l.uuid, l.system_code, l.name, l.type
         HAVING COUNT(s.id) = 0
         ORDER BY l.type, l.system_code, l.name
         LIMIT 150`,
      [envName],
    );
    const rsiCoverage = await rows(
      client,
      `SELECT
          (SELECT COUNT(*) FROM rsi.starmap_locations)::int AS rsi_locations,
          (SELECT COUNT(*) FROM game.locations WHERE env = $1)::int AS game_locations,
          (SELECT COUNT(*) FROM game.locations WHERE env = $1 AND rsi_starmap_location_id IS NOT NULL)::int AS linked_game_locations`,
      [envName],
    );

    console.log(
      JSON.stringify(
        {
          env: envName,
          parentSummary,
          missingParents,
          shopSummary: shopSummary[0] ?? {},
          unlinkedShops,
          inventorySummary,
          placesWithoutShops,
          rsiCoverage: rsiCoverage[0] ?? {},
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
