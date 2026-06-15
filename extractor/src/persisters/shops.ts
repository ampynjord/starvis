/**
 * SHOPS → shops + shop_inventory tables
 */
import { buildLocationSlugIndex, extractShopsFromPrefabs } from '../shop-extractor.js';
import { batchUpsert } from './batch.js';
import type { PersistContext } from './context.js';

export async function saveShopsData(ctx: PersistContext): Promise<{ shops: number; inventory: number }> {
  const { conn, env, df, loc, onProgress } = ctx;
  const provider = df.getProvider();
  if (!provider) {
    onProgress?.('Shops: P4K provider not available, skipping');
    return { shops: 0, inventory: 0 };
  }

  // 1. Extract shop instances from Prefab XMLs + ShopFranchise DataForge records
  onProgress?.('Shops: extracting from Prefab XMLs…');
  const shops = await extractShopsFromPrefabs(df, provider, loc);
  onProgress?.(`Shops: ${shops.length} instances extracted from Prefab XMLs`);

  // 2. Build location slug → loc_key index from the locations table (already populated)
  //    loc_key here = the game localization key, e.g. "@ui_pregame_port_Area18_name"
  //    We store this directly in canonical_location_key so the IHM can join shops ↔ locations.
  const { rows: locRows } = await conn.query<any>(
    `SELECT class_name, name, loc_key, type FROM game.locations WHERE env = $1 AND loc_key IS NOT NULL AND loc_key != ''`,
    [env],
  );
  const slugIndex = buildLocationSlugIndex(
    (locRows as any[]).map((r: any) => ({
      class_name: String(r.class_name ?? ''),
      name: String(r.name ?? ''),
      loc_key: r.loc_key ? String(r.loc_key) : null,
      type: String(r.type ?? ''),
    })),
  );
  onProgress?.(`Shops: built location index with ${slugIndex.size} slug entries from ${locRows.length} locations`);

  // Also build loc_key → location metadata (system, planet_moon, city, location)
  // Walk the parent chain: landing_zone → moon/planet → system
  // For simplicity we look up the direct location name + its parent's name
  const locMetaByLocKey = new Map<string, { location: string; system: string | null; planet_moon: string | null; city: string | null }>();

  // Build parent map
  const { rows: allLocRows } = await conn.query<any>(
    `SELECT uuid, class_name, name, loc_key, type, system_code, parent_uuid FROM game.locations WHERE env = $1`,
    [env],
  );
  const locByUuid = new Map<string, any>((allLocRows as any[]).map((r: any) => [r.uuid, r]));

  for (const row of allLocRows as any[]) {
    if (!row.loc_key) continue;
    const type = (row.type || '').toLowerCase();

    let system: string | null = row.system_code || null;
    let planet_moon: string | null = null;
    let city: string | null = null;
    const location = row.name || row.class_name;

    // Resolve human-readable system name from system_code
    if (system) {
      // Try to find system row by class_name matching system_code
      const sysRow = (allLocRows as any[]).find(
        (r: any) => r.type === 'system' && (r.class_name || '').toLowerCase().includes(system!.toLowerCase()),
      );
      if (sysRow) system = sysRow.name || system;
    }

    if (['landing_zone', 'outpost', 'station', 'rest_stop'].includes(type)) {
      city = row.name;
      // Walk up to find planet/moon
      const parent = row.parent_uuid ? locByUuid.get(row.parent_uuid) : null;
      if (parent) {
        const pType = (parent.type || '').toLowerCase();
        if (['planet', 'moon', 'asteroid'].includes(pType)) {
          planet_moon = parent.name;
        }
      }
    } else if (['planet', 'moon'].includes(type)) {
      planet_moon = row.name;
    }

    locMetaByLocKey.set(row.loc_key, { location, system, planet_moon, city });
  }

  // 3. Build shop rows
  const shopRows: (string | number | null)[][] = [];
  for (const shop of shops) {
    // Resolve loc_key from location slug
    const slug = shop.locationSlug.toLowerCase().replace(/[^a-z0-9]/g, '');
    const locKey = slugIndex.get(slug) ?? null;

    const meta = locKey ? locMetaByLocKey.get(locKey) : null;

    // Normalize shop name
    const normalizedName = shop.name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const canonicalShopKey = locKey ? `${locKey}::${normalizedName}` : normalizedName;

    shopRows.push([
      env,
      shop.name,
      normalizedName,
      canonicalShopKey,
      locKey, // canonical_location_key = game loc_key (e.g. "@ui_pregame_port_Area18_name")
      meta?.location ?? null,
      meta?.system ?? null,
      meta?.planet_moon ?? null,
      meta?.city ?? null,
      shop.shopType,
      shop.className,
      shop.franchiseSlug,
      shop.locationSlug,
      shop.franchiseLocKey,
      shop.p4kPath,
      shop.rawJson ? JSON.stringify(shop.rawJson) : null,
    ]);
  }

  const SHOP_CONFLICT = `(class_name, env) DO UPDATE SET
    name=EXCLUDED.name, normalized_name=EXCLUDED.normalized_name,
    canonical_shop_key=EXCLUDED.canonical_shop_key, canonical_location_key=EXCLUDED.canonical_location_key,
    location=EXCLUDED.location, system=EXCLUDED.system, planet_moon=EXCLUDED.planet_moon, city=EXCLUDED.city,
    shop_type=EXCLUDED.shop_type, franchise_slug=EXCLUDED.franchise_slug, location_slug=EXCLUDED.location_slug,
    franchise_loc_key=EXCLUDED.franchise_loc_key, p4k_path=EXCLUDED.p4k_path, raw_json=EXCLUDED.raw_json,
    updated_at=CURRENT_TIMESTAMP`;

  let savedShops = 0;
  if (shopRows.length > 0) {
    savedShops = await batchUpsert(
      conn,
      `INSERT INTO game.shops (env, name, normalized_name, canonical_shop_key, canonical_location_key, location, system, planet_moon, city, shop_type, class_name, franchise_slug, location_slug, franchise_loc_key, p4k_path, raw_json)`,
      SHOP_CONFLICT,
      16,
      shopRows,
    );
  }

  // shop_inventory is not populated from extracted game files yet. Remove stale
  // manual/community rows for this environment so the API never exposes guessed inventory.
  const { rowCount: deletedInventoryRows } = await conn.query(
    `DELETE FROM game.shop_inventory si
      USING game.shops s
      WHERE si.shop_id = s.id
        AND s.env = $1`,
    [env],
  );

  onProgress?.(`Shops: ${savedShops}/${shops.length} saved; ${deletedInventoryRows ?? 0} manual inventory rows removed`);
  return { shops: savedShops, inventory: 0 };
}
