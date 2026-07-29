/**
 * LOCATIONS (StarMapObject) → locations table
 */
import { extractAmenityTypes, extractLocationAmenities } from '../extractors/location-amenity-extractor.js';
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

  await saveLocationAmenities(ctx, records);

  return records.length;
}

/**
 * Ce qu'on peut faire a chaque endroit.
 *
 * Ecrit apres les lieux : les rattachements portent une cle etrangere vers
 * `game.locations`, et les inserer avant echouerait sur un lieu qui n'existe pas
 * encore.
 */
async function saveLocationAmenities(ctx: PersistContext, records: { uuid: string; className: string }[]): Promise<void> {
  const { conn, env, df, loc, onProgress } = ctx;
  const locAdapter = loc.isLoaded ? { resolveKey: (k: string) => loc.resolveKey(k) ?? null } : { resolveKey: () => null };

  const types = extractAmenityTypes(df, locAdapter);
  if (types.length === 0) {
    onProgress?.('Amenities: catalogue empty, skipping');
    return;
  }

  await batchUpsert(
    conn,
    'INSERT INTO game.location_amenity_types (id, env, name, display_name, loc_key, icon_path)',
    '(id, env) DO UPDATE SET name=EXCLUDED.name, display_name=EXCLUDED.display_name, loc_key=EXCLUDED.loc_key, icon_path=EXCLUDED.icon_path, updated_at=CURRENT_TIMESTAMP',
    6,
    types.map((t) => [
      t.id,
      env,
      t.name.substring(0, 120),
      t.displayName?.substring(0, 160) ?? null,
      t.locKey,
      t.iconPath?.substring(0, 255) ?? null,
    ]),
  );

  const uuidByClassName = new Map(records.map((r) => [r.className, r.uuid]));
  const links = extractLocationAmenities(df, new Set(uuidByClassName.keys()));
  const knownAmenities = new Set(types.map((t) => t.id));

  // Un lieu peut referencer une commodite absente du catalogue ; l'inserer
  // violerait la cle etrangere et ferait echouer toute l'extraction pour une
  // ligne.
  const rows = links
    .filter((link) => knownAmenities.has(link.amenityId))
    .map((link) => [env, uuidByClassName.get(link.locationClassName) as string, link.amenityId]);

  // Remplacement complet : une commodite retiree d'un lieu par une mise a jour
  // du jeu doit disparaitre, ce qu'un simple upsert ne ferait pas.
  await conn.query('DELETE FROM game.location_amenities WHERE env = $1', [env]);
  const affected = await batchUpsert(
    conn,
    'INSERT INTO game.location_amenities (env, location_uuid, amenity_id)',
    '(env, location_uuid, amenity_id) DO NOTHING',
    3,
    rows,
  );

  const dropped = links.length - rows.length;
  onProgress?.(`Amenities: ${types.length} types, ${affected} links${dropped > 0 ? ` (${dropped} unknown amenity refs skipped)` : ''}`);
}
