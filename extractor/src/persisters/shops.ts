/**
 * SHOPS -> shops + shop_inventory + commodity_prices tables
 */
import path from 'node:path';

import { buildLocationSlugIndex, extractShopsFromPrefabs, type ShopExtractRecord } from '../shop-extractor.js';
import { batchUpsert } from './batch.js';
import type { PersistContext } from './context.js';

type InventoryKind = 'ship' | 'component' | 'item' | 'commodity' | 'unknown';

type ShopInventoryEntry = {
  uuid: string;
  buyPrice: number | null;
  sellPrice: number | null;
  currentInventory: number | null;
  maxInventory: number | null;
  rentalOfferings: unknown[] | null;
};

type ShopInventoryFile = ShopExtractRecord & {
  sourceFile: string;
  shopId: string | null;
  inventory: ShopInventoryEntry[];
};

type EntityRef = {
  kind: InventoryKind;
  uuid: string;
  className: string;
};

type EntityIndexes = {
  byUuid: Map<string, EntityRef>;
};

const LOCATION_WORDS = [
  'area18',
  'a18',
  'lorville',
  'newbabbage',
  'microtech',
  'portolisar',
  'grimhex',
  'levski',
  'orison',
  'crusader',
  'hurston',
  'arccorp',
  'arcCorp',
  'stanton',
  'pyro',
  'reststop',
  'rest',
  'everus',
  'seraphim',
  'baijini',
  'tressler',
  'covalex',
  'fairoaks',
  'klescher',
];

const SHOP_TYPE_RULES: Array<{ type: string; pattern: RegExp }> = [
  { type: 'commodities', pattern: /(?:^|_)(admin|tdd|commex|commodity|commodities|shubin|refinery)(?:_|$)/i },
  { type: 'vehicle_sales', pattern: /(newdeal|astroarmada|shipshop|vehicle.*sale|teach|showroom)/i },
  { type: 'vehicle_rental', pattern: /(rental|rentals|vantage|traveler)/i },
  { type: 'ship_parts', pattern: /(centermass|dumpersdepot|hardpoint|omega|shipweapon|shipweapons|component|components)/i },
  { type: 'mining', pattern: /(?:^|_)(mining|mineables)(?:_|$)/i },
  { type: 'armor', pattern: /(garrity|armor|armour|defense)/i },
  { type: 'weapons', pattern: /(cubby|livefire|weapons|weapon|conscientious|blast)/i },
  { type: 'medical', pattern: /(medical|pharmacy|hospital|clinic|apothecary)/i },
  { type: 'clothing', pattern: /(casaba|tammany|aparelli|kc|trending|clothing|clothes)/i },
  {
    type: 'food_drink',
    pattern: /(whammer|ellroy|cafe|bar|pizza|noodle|juice|hotdog|burrito|coffee|gloc|garcia|wally|twyn|skutter|food|drink)/i,
  },
];

function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeLookupSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function titleCaseCompact(value: string): string {
  return value
    .replace(/^inv[_-]/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractUuid(value: unknown): string | null {
  if (typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const id = (value as { ID?: unknown }).ID;
  if (Array.isArray(id)) {
    const found = id.find((part) => typeof part === 'string' && /^[0-9a-f-]{36}$/i.test(part));
    return found ? String(found) : null;
  }
  if (typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) return id;
  return null;
}

function shopInventoryUuidToDataForgeUuid(uuid: string): string {
  const hex = uuid.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return uuid;
  const bytes = hex.match(/../g);
  if (!bytes || bytes.length !== 16) return uuid;
  const reordered = [
    ...bytes.slice(4, 8),
    ...bytes.slice(2, 4),
    ...bytes.slice(0, 2),
    ...bytes.slice(14, 16).reverse(),
    ...bytes.slice(8, 14).reverse(),
  ];
  return `${reordered.slice(0, 4).join('')}-${reordered.slice(4, 6).join('')}-${reordered.slice(6, 8).join('')}-${reordered.slice(8, 10).join('')}-${reordered.slice(10, 16).join('')}`;
}

function deriveLocationSlug(parts: string[]): string {
  const normalized = parts.map(normalizeLookupSlug);
  for (let size = 1; size <= Math.min(3, parts.length); size++) {
    const tail = normalized.slice(-size).join('');
    if (LOCATION_WORDS.some((word) => tail.includes(normalizeLookupSlug(word)))) {
      return tail;
    }
  }
  return normalized.slice(1).join('') || normalized[0] || 'unknown';
}

function deriveShopType(stem: string): string {
  for (const rule of SHOP_TYPE_RULES) {
    if (rule.pattern.test(stem)) return rule.type;
  }
  return 'general';
}

function normalizeRentalOfferings(raw: unknown): unknown[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw;
}

function extractRentalPrices(rentalOfferings: unknown[] | null): {
  rental1d: number | null;
  rental3d: number | null;
  rental7d: number | null;
  rental30d: number | null;
} {
  const result = {
    rental1d: null as number | null,
    rental3d: null as number | null,
    rental7d: null as number | null,
    rental30d: null as number | null,
  };
  if (!rentalOfferings) return result;

  for (const offering of rentalOfferings) {
    if (!offering || typeof offering !== 'object') continue;
    const record = offering as Record<string, unknown>;
    const duration = toNumber(record.Duration ?? record.duration ?? record.RentalDuration ?? record.rentalDuration);
    const price = toNumber(record.Price ?? record.price ?? record.RentalPrice ?? record.rentalPrice);
    if (duration === null || price === null) continue;
    if (duration <= 1) result.rental1d = price;
    else if (duration <= 3) result.rental3d = price;
    else if (duration <= 7) result.rental7d = price;
    else if (duration <= 30) result.rental30d = price;
  }

  return result;
}

async function extractShopInventoryFiles(ctx: PersistContext): Promise<ShopInventoryFile[]> {
  const provider = ctx.df.getProvider();
  if (!provider) return [];

  const entries = await provider.findFiles(/Data[/\\]Scripts[/\\]ShopInventories[/\\].*\.json$/i, 10000);
  const shops: ShopInventoryFile[] = [];

  for (const entry of entries) {
    const filePath = entry.fileName.replace(/\\/g, '/');
    const fileName = path.posix.basename(filePath);
    const rawStem = fileName.replace(/\.json$/i, '');
    const stem = rawStem.replace(/^Inv[_-]/i, '');
    const parts = stem.split(/[_-]+/).filter(Boolean);
    const franchiseSlug = normalizeLookupSlug(parts[0] ?? stem);
    const locationSlug = deriveLocationSlug(parts);
    const shopType = deriveShopType(stem);
    const className = `inventory_${normalizeSlug(stem).replace(/-/g, '_')}`;

    let parsed: any;
    try {
      parsed = JSON.parse((await provider.readFileFromEntry(entry)).toString('utf8'));
    } catch {
      continue;
    }

    const rawInventory = parsed?.Collection?.Inventory ?? parsed?.Inventory ?? [];
    const inventory = Array.isArray(rawInventory)
      ? rawInventory
          .map((record: any): ShopInventoryEntry | null => {
            const uuid = extractUuid(record?.ID);
            if (!uuid) return null;
            return {
              uuid,
              buyPrice: toNumber(record?.BuyPrice),
              sellPrice: toNumber(record?.SellPrice),
              currentInventory: toNumber(record?.CurrentInventory),
              maxInventory: toNumber(record?.MaxInventory),
              rentalOfferings: normalizeRentalOfferings(record?.RentalOfferings),
            };
          })
          .filter((record: ShopInventoryEntry | null): record is ShopInventoryEntry => Boolean(record))
      : [];

    shops.push({
      className,
      franchiseSlug,
      locationSlug,
      shopType,
      name: titleCaseCompact(stem),
      franchiseLocKey: null,
      p4kPath: filePath,
      sourceFile: filePath,
      shopId: extractUuid(parsed?.ShopID),
      inventory,
      rawJson: {
        source: 'shop_inventory_json',
        filePath,
        shopId: extractUuid(parsed?.ShopID),
        inventoryCount: inventory.length,
        shopType,
        franchiseSlug,
        locationSlug,
      },
    });
  }

  return shops;
}

async function loadEntityIndexes(ctx: PersistContext): Promise<EntityIndexes> {
  const { conn, env } = ctx;
  const byUuid = new Map<string, EntityRef>();

  const addRows = async (kind: InventoryKind, table: string) => {
    const { rows } = await conn.query<{ uuid: string; class_name: string }>(`SELECT uuid, class_name FROM ${table} WHERE env = $1`, [env]);
    for (const row of rows) {
      if (!byUuid.has(row.uuid)) byUuid.set(row.uuid, { kind, uuid: row.uuid, className: row.class_name });
    }
  };

  await addRows('ship', 'game.ships');
  await addRows('component', 'game.components');
  await addRows('item', 'game.items');
  await addRows('commodity', 'game.commodities');

  return { byUuid };
}

function resolveLocMeta(
  shop: ShopExtractRecord,
  slugIndex: Map<string, string>,
  locMetaByLocKey: Map<string, { uuid: string; location: string; system: string | null; planet_moon: string | null; city: string | null }>,
) {
  const slug = normalizeLookupSlug(shop.locationSlug);
  const locKey = slugIndex.get(slug) ?? null;
  const meta = locKey ? locMetaByLocKey.get(locKey) : null;
  return { locKey, meta };
}

export async function saveShopsData(ctx: PersistContext): Promise<{ shops: number; inventory: number }> {
  const { conn, env, df, loc, onProgress } = ctx;
  const provider = df.getProvider();
  if (!provider) {
    onProgress?.('Shops: P4K provider not available, skipping');
    return { shops: 0, inventory: 0 };
  }

  onProgress?.('Shops: extracting physical shop locations from Prefab XMLs...');
  const prefabShops = await extractShopsFromPrefabs(df, provider, loc);
  onProgress?.(`Shops: ${prefabShops.length} physical shop instances extracted from Prefab XMLs`);

  onProgress?.('Shops: extracting real inventories from ShopInventories JSON files...');
  const inventoryShops = await extractShopInventoryFiles(ctx);
  const inventoryItemCount = inventoryShops.reduce((sum, shop) => sum + shop.inventory.length, 0);
  onProgress?.(`Shops: ${inventoryShops.length} inventory files with ${inventoryItemCount} priced entries extracted`);

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

  const locMetaByLocKey = new Map<
    string,
    { uuid: string; location: string; system: string | null; planet_moon: string | null; city: string | null }
  >();
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

    if (system) {
      const sysRow = (allLocRows as any[]).find(
        (r: any) => r.type === 'system' && (r.class_name || '').toLowerCase().includes(system!.toLowerCase()),
      );
      if (sysRow) system = sysRow.name || system;
    }

    if (['landing_zone', 'outpost', 'station', 'rest_stop'].includes(type)) {
      city = row.name;
      const parent = row.parent_uuid ? locByUuid.get(row.parent_uuid) : null;
      if (parent) {
        const pType = (parent.type || '').toLowerCase();
        if (['planet', 'moon', 'asteroid'].includes(pType)) planet_moon = parent.name;
      }
    } else if (['planet', 'moon'].includes(type)) {
      planet_moon = row.name;
    }

    locMetaByLocKey.set(row.loc_key, { uuid: row.uuid, location, system, planet_moon, city });
  }

  const allShops: ShopExtractRecord[] = [...prefabShops, ...inventoryShops];
  const shopRows: (string | number | null)[][] = [];
  for (const shop of allShops) {
    const { locKey, meta } = resolveLocMeta(shop, slugIndex, locMetaByLocKey);
    const normalizedName = normalizeSlug(shop.name);
    const canonicalShopKey = locKey ? `${locKey}::${normalizedName}` : `${shop.locationSlug}::${normalizedName}`;

    shopRows.push([
      env,
      shop.name,
      normalizedName,
      canonicalShopKey,
      locKey,
      meta?.uuid ?? null,
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
    location_uuid=EXCLUDED.location_uuid,
    location=EXCLUDED.location, system=EXCLUDED.system, planet_moon=EXCLUDED.planet_moon, city=EXCLUDED.city,
    shop_type=EXCLUDED.shop_type, franchise_slug=EXCLUDED.franchise_slug, location_slug=EXCLUDED.location_slug,
    franchise_loc_key=EXCLUDED.franchise_loc_key, p4k_path=EXCLUDED.p4k_path, raw_json=EXCLUDED.raw_json,
    updated_at=CURRENT_TIMESTAMP`;

  const savedShops =
    shopRows.length > 0
      ? await batchUpsert(
          conn,
          `INSERT INTO game.shops (env, name, normalized_name, canonical_shop_key, canonical_location_key, location_uuid, location, system, planet_moon, city, shop_type, class_name, franchise_slug, location_slug, franchise_loc_key, p4k_path, raw_json)`,
          SHOP_CONFLICT,
          17,
          shopRows,
        )
      : 0;

  const { rowCount: deletedInventoryRows } = await conn.query(
    `DELETE FROM game.shop_inventory si
      USING game.shops s
      WHERE si.shop_id = s.id
        AND s.env = $1`,
    [env],
  );
  const { rowCount: deletedCommodityRows } = await conn.query(
    `DELETE FROM game.commodity_prices cp
      USING game.shops s
      WHERE cp.shop_id = s.id
        AND s.env = $1`,
    [env],
  );

  const entityIndexes = await loadEntityIndexes(ctx);
  const { rows: savedShopRows } = await conn.query<{ id: number; class_name: string }>(
    `SELECT id, class_name FROM game.shops WHERE env = $1`,
    [env],
  );
  const shopIdByClass = new Map(savedShopRows.map((row) => [row.class_name, row.id]));

  const inventoryRows: (string | number | null | boolean)[][] = [];
  const commodityPriceRows: (string | number | null | boolean)[][] = [];
  let unmatchedInventory = 0;

  for (const shop of inventoryShops) {
    const shopId = shopIdByClass.get(shop.className);
    if (!shopId) continue;

    for (const entry of shop.inventory) {
      const dataForgeUuid = shopInventoryUuidToDataForgeUuid(entry.uuid);
      const entity = entityIndexes.byUuid.get(entry.uuid) ?? entityIndexes.byUuid.get(dataForgeUuid);
      const kind = entity?.kind ?? 'unknown';
      const entityUuid = entity?.uuid ?? dataForgeUuid;
      const className = entity?.className ?? entry.uuid;
      const rentalPrices = extractRentalPrices(entry.rentalOfferings);
      const rawJson = JSON.stringify({
        shopInventoryUuid: entry.uuid,
        dataForgeUuid,
        rentalOfferings: entry.rentalOfferings ?? [],
      });

      if (!entity) unmatchedInventory += 1;

      inventoryRows.push([
        shopId,
        entityUuid,
        className,
        kind,
        entry.buyPrice,
        entry.sellPrice,
        entry.currentInventory,
        entry.maxInventory,
        rentalPrices.rental1d,
        rentalPrices.rental3d,
        rentalPrices.rental7d,
        rentalPrices.rental30d,
        'shop_inventory_json',
        entity ? 1.0 : 0.85,
        rawJson,
      ]);

      if (kind === 'commodity') {
        commodityPriceRows.push([entityUuid, env, shopId, entry.buyPrice, entry.sellPrice]);
      }
    }
  }

  const savedInventory =
    inventoryRows.length > 0
      ? await batchUpsert(
          conn,
          `INSERT INTO game.shop_inventory
            (shop_id, component_uuid, component_class_name, inventory_kind, base_price, sell_price, current_inventory, max_inventory, rental_price_1d, rental_price_3d, rental_price_7d, rental_price_30d, source, confidence, raw_json)`,
          `(shop_id, component_class_name) DO UPDATE SET
            component_uuid=EXCLUDED.component_uuid,
            inventory_kind=EXCLUDED.inventory_kind,
            base_price=EXCLUDED.base_price,
            sell_price=EXCLUDED.sell_price,
            current_inventory=EXCLUDED.current_inventory,
            max_inventory=EXCLUDED.max_inventory,
            rental_price_1d=EXCLUDED.rental_price_1d,
            rental_price_3d=EXCLUDED.rental_price_3d,
            rental_price_7d=EXCLUDED.rental_price_7d,
            rental_price_30d=EXCLUDED.rental_price_30d,
            source=EXCLUDED.source,
            confidence=EXCLUDED.confidence,
            raw_json=EXCLUDED.raw_json,
            updated_at=CURRENT_TIMESTAMP`,
          15,
          inventoryRows,
          200,
        )
      : 0;

  const savedCommodityPrices =
    commodityPriceRows.length > 0
      ? await batchUpsert(
          conn,
          `INSERT INTO game.commodity_prices (commodity_uuid, commodity_env, shop_id, buy_price, sell_price)`,
          `(commodity_uuid, shop_id) DO UPDATE SET
            buy_price=EXCLUDED.buy_price,
            sell_price=EXCLUDED.sell_price,
            reported_at=CURRENT_TIMESTAMP`,
          5,
          commodityPriceRows,
          200,
        )
      : 0;

  onProgress?.(
    `Shops: ${savedShops}/${allShops.length} shops saved; ${deletedInventoryRows ?? 0} old inventory rows and ${deletedCommodityRows ?? 0} old commodity prices removed; ${savedInventory} real inventory rows, ${savedCommodityPrices} commodity prices saved (${unmatchedInventory} unmatched UUIDs)`,
  );
  return { shops: savedShops, inventory: savedInventory };
}
