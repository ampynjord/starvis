/**
 * SHOPS → shops + shop_inventory tables
 */
import { buildLocationSlugIndex, extractShopsFromPrefabs } from '../shop-extractor.js';
import { batchUpsert } from './batch.js';
import type { PersistContext } from './context.js';

type InventoryCandidate = {
  uuid: string;
  className: string;
  source: string;
  confidence: number;
};

const SHIP_PART_COMPONENT_TYPES = [
  'Cooler',
  'PowerPlant',
  'QuantumDrive',
  'Shield',
  'WeaponGun',
  'Missile',
  'MissileRack',
  'Gimbal',
  'Radar',
  'Countermeasure',
  'MiningLaser',
  'MiningModifier',
  'TractorBeam',
  'SalvageHead',
  'FuelTank',
  'FuelIntake',
  'EMP',
  'QuantumInterdictionGenerator',
  'Turret',
  'TurretUnmanned',
  'RocketPod',
];

const SHOP_ITEM_TYPES: Record<string, string[]> = {
  armor: ['Armor', 'Armor_Helmet', 'Armor_Torso', 'Armor_Arms', 'Armor_Legs', 'Armor_Backpack', 'Undersuit'],
  clothing: ['Clothing'],
  food_drink: ['Consumable'],
  general: ['Gadget', 'Tool', 'Consumable'],
  medical: ['Consumable'],
  weapons: ['FPS_Weapon', 'Attachment', 'Magazine', 'Tool'],
};

function placeholders(values: readonly unknown[]): string {
  return values.map((_, idx) => `$${idx + 2}`).join(', ');
}

async function loadInventoryCandidates(ctx: PersistContext, shopType: string | null): Promise<InventoryCandidate[]> {
  const { conn, env } = ctx;
  const normalizedType = (shopType ?? 'general').toLowerCase();
  const candidates: InventoryCandidate[] = [];

  const itemTypes = SHOP_ITEM_TYPES[normalizedType] ?? [];
  if (itemTypes.length > 0) {
    const { rows } = await conn.query<{ uuid: string; class_name: string }>(
      `SELECT uuid, class_name
       FROM game.items
       WHERE env = $1 AND type IN (${placeholders(itemTypes)})
       ORDER BY type, name, class_name`,
      [env, ...itemTypes],
    );
    candidates.push(
      ...rows.map((row) => ({
        uuid: row.uuid,
        className: row.class_name,
        source: 'inferred_shop_type:item',
        confidence: 0.35,
      })),
    );
  }

  if (normalizedType === 'ship_parts') {
    const { rows } = await conn.query<{ uuid: string; class_name: string }>(
      `SELECT uuid, class_name
       FROM game.components
       WHERE env = $1 AND type IN (${placeholders(SHIP_PART_COMPONENT_TYPES)})
       ORDER BY type, name, class_name`,
      [env, ...SHIP_PART_COMPONENT_TYPES],
    );
    candidates.push(
      ...rows.map((row) => ({
        uuid: row.uuid,
        className: row.class_name,
        source: 'inferred_shop_type:component',
        confidence: 0.35,
      })),
    );
  }

  return candidates;
}

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

  const { rowCount: deletedInventoryRows } = await conn.query(
    `DELETE FROM game.shop_inventory si
      USING game.shops s
      WHERE si.shop_id = s.id
        AND s.env = $1`,
    [env],
  );

  const { rows: savedShopRows } = await conn.query<{ id: number; shop_type: string | null }>(
    `SELECT id, shop_type FROM game.shops WHERE env = $1 ORDER BY id`,
    [env],
  );
  const candidatesByType = new Map<string, InventoryCandidate[]>();
  const inventoryRows: (string | number | null | boolean)[][] = [];

  for (const shop of savedShopRows) {
    const shopType = (shop.shop_type ?? 'general').toLowerCase();
    if (shopType === 'commodities' || shopType === 'service' || shopType === 'bounty') continue;
    let candidates = candidatesByType.get(shopType);
    if (!candidates) {
      candidates = await loadInventoryCandidates(ctx, shopType);
      candidatesByType.set(shopType, candidates);
    }
    for (const candidate of candidates) {
      inventoryRows.push([
        shop.id,
        candidate.uuid,
        candidate.className,
        null,
        null,
        null,
        null,
        null,
        candidate.source,
        candidate.confidence,
      ]);
    }
  }

  const savedInventory =
    inventoryRows.length > 0
      ? await batchUpsert(
          conn,
          `INSERT INTO game.shop_inventory
            (shop_id, component_uuid, component_class_name, base_price, rental_price_1d, rental_price_3d, rental_price_7d, rental_price_30d, source, confidence)`,
          `(shop_id, component_class_name) DO UPDATE SET
            component_uuid=EXCLUDED.component_uuid,
            base_price=EXCLUDED.base_price,
            rental_price_1d=EXCLUDED.rental_price_1d,
            rental_price_3d=EXCLUDED.rental_price_3d,
            rental_price_7d=EXCLUDED.rental_price_7d,
            rental_price_30d=EXCLUDED.rental_price_30d,
            source=EXCLUDED.source,
            confidence=EXCLUDED.confidence,
            updated_at=CURRENT_TIMESTAMP`,
          10,
          inventoryRows,
          200,
        )
      : 0;

  onProgress?.(
    `Shops: ${savedShops}/${shops.length} saved; ${deletedInventoryRows ?? 0} old inventory rows removed; ${savedInventory} inferred inventory rows saved`,
  );
  return { shops: savedShops, inventory: savedInventory };
}
