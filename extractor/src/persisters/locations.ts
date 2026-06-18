/**
 * LOCATIONS (StarMapObject) → locations table
 */
import { extractLocations } from '../extractors/location-extractor.js';
import { batchUpsert } from './batch.js';
import type { PersistContext } from './context.js';

export async function saveLocations(ctx: PersistContext): Promise<number> {
  const { conn, env, df, loc, onProgress } = ctx;
  const locAdapter = loc.isLoaded ? { resolveKey: (k: string) => loc.resolveKey(k) ?? null } : { resolveKey: () => null };

  const records = extractLocations(df, locAdapter, onProgress);
  if (!records.length) {
    onProgress?.('Locations: 0 found');
    return 0;
  }

  const rows: (string | number | null)[][] = records.map((r) => [
    env,
    r.uuid,
    r.className.substring(0, 255),
    r.name.substring(0, 255),
    r.type.substring(0, 50),
    r.systemCode,
    r.parentUuid,
    r.locKey,
    r.description,
    r.coordinates ? JSON.stringify(r.coordinates) : null,
    r.p4kPath,
    r.rawJson ? JSON.stringify(r.rawJson) : null,
    r.isScannable ? 1 : 0,
    r.hideInStarmap ? 1 : 0,
  ]);

  const affected = await batchUpsert(
    conn,
    'INSERT INTO game.locations (env, uuid, class_name, name, type, system_code, parent_uuid, loc_key, description, coordinates, p4k_path, raw_json, is_scannable, hide_in_starmap)',
    '(uuid, env) DO UPDATE SET class_name=EXCLUDED.class_name, name=EXCLUDED.name, type=EXCLUDED.type, system_code=EXCLUDED.system_code, parent_uuid=EXCLUDED.parent_uuid, loc_key=EXCLUDED.loc_key, description=EXCLUDED.description, coordinates=EXCLUDED.coordinates, p4k_path=EXCLUDED.p4k_path, raw_json=EXCLUDED.raw_json, is_scannable=EXCLUDED.is_scannable, hide_in_starmap=EXCLUDED.hide_in_starmap',
    14,
    rows,
  );

  onProgress?.(`Locations: ${affected} upserted`);
  return records.length;
}
