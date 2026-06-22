/**
 * ItemQueryService — FPS weapons, armor, clothing, attachments, gadgets, consumables
 */
import type { PrismaLike as PrismaClient } from '@starvis/db';
import { cleanItemDisplayName } from '../normalizers/items.js';
import {
  convertBigIntToNumber,
  type FiltersResult,
  type PaginatedResult,
  paginate,
  type Row,
  stripInternal,
  toPostgres,
} from './shared.js';

const ITEM_JSON_SORT_MAP: Record<string, string> = {
  'game_data.weapon_damage': "(i.game_data#>>'{weapon_damage}')::numeric",
  'game_data.weapon_dps': "(i.game_data#>>'{weapon_dps}')::numeric",
  'game_data.weapon_fire_rate': "(i.game_data#>>'{weapon_fire_rate}')::numeric",
  'game_data.weapon_range': "(i.game_data#>>'{weapon_range}')::numeric",
  'game_data.armor_dr': "(i.game_data#>>'{armor_damage_reduction}')::numeric",
};

const ITEM_SORT = new Set([
  'name',
  'class_name',
  'type',
  'sub_type',
  'size',
  'grade',
  'manufacturer_code',
  'mass',
  'hp',
  'weapon_damage',
  'weapon_fire_rate',
  'weapon_range',
  'weapon_dps',
  'armor_damage_reduction',
  'armor_temp_min',
  'armor_temp_max',
]);

const FPS_ALL_TYPES = [
  'FPS_Weapon',
  'Armor',
  'Armor_Helmet',
  'Armor_Torso',
  'Armor_Arms',
  'Armor_Legs',
  'Armor_Backpack',
  'Undersuit',
  'Tool',
  'Consumable',
  'Magazine',
  'Attachment',
  'Gadget',
  'Clothing',
];
const FPS_COVERED_TYPES = new Set([...FPS_ALL_TYPES, 'Armor']);

const CHIP_SUBTYPES = ['Hacking', 'SystemAccess'];
const CONSUMABLE_SUBTYPE_ORDER = ['Food', 'Drink', 'Medical', 'MedPack', 'OxygenCap', 'Stim'];

// ── New taxonomy groups — used for item_group queries ─────────────────────────
const TAXONOMY_GROUPS: Record<string, { types: string[]; subTypes?: string[]; excludeSubTypes?: string[] }> = {
  armor_all: { types: ['Armor', 'Armor_Helmet', 'Armor_Torso', 'Armor_Arms', 'Armor_Legs', 'Armor_Backpack', 'Undersuit'] },
  clothing_all: { types: ['Clothing'] },
  weapons_all: { types: ['FPS_Weapon'], excludeSubTypes: ['Throwable', 'Mine'] },
  weapons_primary: { types: ['FPS_Weapon'], subTypes: ['Assault Rifle', 'SMG', 'Shotgun', 'Sniper Rifle', 'LMG'] },
  utility_all: {
    types: ['Tool', 'Gadget', 'Consumable'],
    excludeSubTypes: [
      'Food',
      'Drink',
      'OxygenCap',
      'Assault Rifle',
      'SMG',
      'Shotgun',
      'Sniper Rifle',
      'LMG',
      'Pistol',
      'Launcher',
      'Melee',
      'Throwable',
      'Mine',
    ],
  },
  ammo_all: { types: ['Magazine'] },
  sustenance_all: { types: ['Consumable'], subTypes: ['Food', 'Drink', 'OxygenCap'] },
  other_all: { types: ['Gadget'], excludeSubTypes: ['Handheld', 'Two-handed', 'Device'] },
  // Legacy
  fps_all: { types: FPS_ALL_TYPES, excludeSubTypes: ['Food', 'Drink'] },
};

const ITEM_CATEGORY_FILTERS: Record<string, { types: string[]; subTypes?: string[]; excludeSubTypes?: string[] }> = {
  armor: TAXONOMY_GROUPS.armor_all,
  'armor-suits': { types: ['Armor'] },
  'armor-undersuits': { types: ['Undersuit'] },
  'armor-helmets': { types: ['Armor_Helmet'] },
  'armor-core': { types: ['Armor_Torso'] },
  'armor-arms': { types: ['Armor_Arms'] },
  'armor-legs': { types: ['Armor_Legs'] },
  'armor-backpacks': { types: ['Armor_Backpack'] },
  'armor-flair': { types: ['Attachment'], subTypes: ['Appearance'] },
  clothing: TAXONOMY_GROUPS.clothing_all,
  weapons: TAXONOMY_GROUPS.weapons_all,
  'weapons-sidearms': { types: ['FPS_Weapon'], subTypes: ['Pistol'] },
  'weapons-primary': TAXONOMY_GROUPS.weapons_primary,
  'weapons-primary-ar': { types: ['FPS_Weapon'], subTypes: ['Assault Rifle'] },
  'weapons-primary-smg': { types: ['FPS_Weapon'], subTypes: ['SMG'] },
  'weapons-primary-shotgun': { types: ['FPS_Weapon'], subTypes: ['Shotgun'] },
  'weapons-primary-sniper': { types: ['FPS_Weapon'], subTypes: ['Sniper Rifle'] },
  'weapons-primary-lmg': { types: ['FPS_Weapon'], subTypes: ['LMG'] },
  'weapons-special': { types: ['FPS_Weapon'], subTypes: ['Launcher'] },
  'weapons-melee': { types: ['FPS_Weapon'], subTypes: ['Melee'] },
  'weapons-attachments': { types: ['Attachment'], subTypes: ['Weapon Modifier'] },
  'weapons-throwables': { types: ['FPS_Weapon'], subTypes: ['Throwable', 'Mine'] },
  utility: TAXONOMY_GROUPS.utility_all,
  'utility-gadgets': { types: ['Gadget'], subTypes: ['Handheld', 'Two-handed', 'Device'] },
  'utility-medical': { types: ['Consumable', 'Tool'], subTypes: ['Medical', 'MedPack', 'Stim'] },
  'utility-cryptokeys': { types: ['Consumable'], subTypes: ['Hacking', 'SystemAccess'] },
  'utility-technology': { types: ['Tool', 'Gadget'], subTypes: ['Multitool', 'Module'] },
  ammo: TAXONOMY_GROUPS.ammo_all,
  sustenance: TAXONOMY_GROUPS.sustenance_all,
  'sustenance-food': { types: ['Consumable'], subTypes: ['Food'] },
  'sustenance-drink': { types: ['Consumable'], subTypes: ['Drink'] },
  'sustenance-oxygen': { types: ['Consumable'], subTypes: ['OxygenCap'] },
  other: TAXONOMY_GROUPS.other_all,
};

// ── Subtype filter options per category slug ─────────────────────────────────
const ARMOR_WEIGHT = [
  { label: 'Light', value: 'Light' },
  { label: 'Medium', value: 'Medium' },
  { label: 'Heavy', value: 'Heavy' },
];

const FPS_SUBTYPE_OPTIONS: Record<string, { label: string; value: string }[]> = {
  // Armor
  armor: ARMOR_WEIGHT,
  'armor-helmets': ARMOR_WEIGHT,
  'armor-core': ARMOR_WEIGHT,
  'armor-arms': ARMOR_WEIGHT,
  'armor-legs': ARMOR_WEIGHT,
  'armor-backpacks': ARMOR_WEIGHT,
  // Weapons
  weapons: ['Pistol', 'SMG', 'Shotgun', 'Sniper Rifle', 'Assault Rifle', 'LMG', 'Launcher', 'Melee'].map((s) => ({ label: s, value: s })),
  'weapons-sidearms': [],
  'weapons-primary': ['Assault Rifle', 'SMG', 'Shotgun', 'Sniper Rifle', 'LMG'].map((s) => ({ label: s, value: s })),
  'weapons-throwables': [
    { label: 'Grenades', value: 'Throwable' },
    { label: 'Mines', value: 'Mine' },
  ],
};

type AttachmentSlot = 'barrel' | 'underbarrel' | 'optic' | 'other';

interface WeaponAttachmentModifier {
  uuid: string;
  class_name: string;
  name: string;
  display_name: string;
  slot: AttachmentSlot;
  manufacturer_code: string | null;
  manufacturer_name: string | null;
  fire_rate_bonus: number;
  damage_bonus: number;
  effects: { key: string; label: string; value: number; unit: 'percent' }[];
}

type ItemBuyLocationSourceStatus = 'available' | 'empty' | 'unavailable' | 'not_checked';

interface ItemBuyLocationSourceMeta {
  status: ItemBuyLocationSourceStatus;
  count: number | null;
  error?: string;
}

export interface ItemBuyLocationResult {
  data: Row[];
  source: 'uex' | 'p4k' | 'none';
  sourcePriority: ['uex', 'p4k'];
  fallbackUsed: boolean;
  reason?: 'uex_available' | 'uex_empty_p4k_available' | 'uex_unavailable_p4k_available' | 'no_uex_or_p4k_location_found';
  sources: {
    uex: ItemBuyLocationSourceMeta;
    p4k: ItemBuyLocationSourceMeta;
  };
}

function itemMarketAggregateSelect(): string {
  return `
    item_market.min_purchase_price,
    item_market.min_rental_price_1d,
    item_market.min_rental_price_3d,
    item_market.min_rental_price_7d,
    item_market.min_rental_price_30d,
    COALESCE(item_market.purchase_location_count, 0)::integer as purchase_location_count,
    COALESCE(item_market.rental_location_count, 0)::integer as rental_location_count`;
}

const ITEM_MARKET_JOIN = `LEFT JOIN (
  SELECT
    shop.env,
    LOWER(si.component_class_name) as component_class_key,
    MIN(si.base_price) FILTER (WHERE si.base_price > 0) as min_purchase_price,
    MIN(si.rental_price_1d) FILTER (WHERE si.rental_price_1d > 0) as min_rental_price_1d,
    MIN(si.rental_price_3d) FILTER (WHERE si.rental_price_3d > 0) as min_rental_price_3d,
    MIN(si.rental_price_7d) FILTER (WHERE si.rental_price_7d > 0) as min_rental_price_7d,
    MIN(si.rental_price_30d) FILTER (WHERE si.rental_price_30d > 0) as min_rental_price_30d,
    COUNT(DISTINCT si.shop_id) FILTER (WHERE si.base_price > 0) as purchase_location_count,
    COUNT(DISTINCT si.shop_id) FILTER (WHERE si.rental_price_1d > 0 OR si.rental_price_3d > 0 OR si.rental_price_7d > 0 OR si.rental_price_30d > 0) as rental_location_count
  FROM game.shop_inventory si
  JOIN game.shops shop ON shop.id = si.shop_id
  WHERE si.inventory_kind IN ('item', 'unknown')
  GROUP BY shop.env, LOWER(si.component_class_name)
) item_market ON item_market.env = i.env
  AND item_market.component_class_key = LOWER(i.class_name)`;

function formatConsumableLabel(subType: string): string {
  const explicitLabels: Record<string, string> = {
    SystemAccess: 'System Access',
    MedPack: 'MedPack',
    OxygenCap: 'Oxygen Cap',
  };
  return explicitLabels[subType] ?? subType.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
}

function orderConsumableEntries(entries: { value: string; count: number }[]) {
  return [...entries].sort((left, right) => {
    const leftIndex = CONSUMABLE_SUBTYPE_ORDER.indexOf(left.value);
    const rightIndex = CONSUMABLE_SUBTYPE_ORDER.indexOf(right.value);
    const leftRank = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const rightRank = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return formatConsumableLabel(left.value).localeCompare(formatConsumableLabel(right.value));
  });
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function readArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(readObject).filter((entry): entry is Record<string, unknown> => !!entry) : [];
}

function percentFromMultiplier(multiplier: unknown): number {
  const value = Number(multiplier);
  if (!Number.isFinite(value) || value === 0 || value === 1) return 0;
  return Math.round((value - 1) * 1000) / 10;
}

function addMultiplierEffect(effects: WeaponAttachmentModifier['effects'], key: string, label: string, multiplier: unknown): number {
  const value = percentFromMultiplier(multiplier);
  if (value !== 0) effects.push({ key, label, value, unit: 'percent' });
  return value;
}

function inferAttachmentSlot(dataJson: Record<string, unknown>): AttachmentSlot {
  const rawData = readObject(readObject(dataJson.rawJson)?.data);
  const components = readArray(rawData?.Components);
  const attachDef = readObject(components.map((component) => readObject(component.AttachDef)).find(Boolean));
  const probe = [
    attachDef?.SubType,
    readObject(attachDef?.mannequinTags)?.mannequinBaseTag,
    readObject(attachDef?.mannequinTags)?.mannequinTypeTag,
    dataJson.p4kPath,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/bottom|underbarrel|ubarrel/.test(probe)) return 'underbarrel';
  if (/barrel|muzzle|suppressor/.test(probe)) return 'barrel';
  if (/optic|scope|sight/.test(probe)) return 'optic';
  return 'other';
}

function extractWeaponAttachmentModifier(row: Row): WeaponAttachmentModifier {
  const dataJson = readObject(row.data_json) ?? readObject(row.dataJson) ?? {};
  const rawData = readObject(readObject(dataJson.rawJson)?.data);
  const components = readArray(rawData?.Components);
  const modifierComponent = components.find((component) => component.__type === 'SWeaponModifierComponentParams');
  const weaponStats = readObject(readObject(modifierComponent?.modifier)?.weaponStats) ?? {};
  const effects: WeaponAttachmentModifier['effects'] = [];

  const fireRateBonus = addMultiplierEffect(effects, 'fire_rate', 'Fire rate', weaponStats.fireRateMultiplier);
  const damageBonus = addMultiplierEffect(effects, 'damage', 'Damage', weaponStats.damageMultiplier);
  addMultiplierEffect(effects, 'projectile_speed', 'Projectile speed', weaponStats.projectileSpeedMultiplier);
  addMultiplierEffect(effects, 'ammo_cost', 'Ammo cost', weaponStats.ammoCostMultiplier);
  addMultiplierEffect(effects, 'heat_generation', 'Heat generation', weaponStats.heatGenerationMultiplier);
  addMultiplierEffect(effects, 'charge_time', 'Charge time', weaponStats.chargeTimeMultiplier);
  addMultiplierEffect(effects, 'sound_radius', 'Sound radius', weaponStats.soundRadiusMultiplier);

  const spreadModifier = readObject(weaponStats.spreadModifier);
  const spreadValues = [
    spreadModifier?.minMultiplier,
    spreadModifier?.maxMultiplier,
    spreadModifier?.attackMultiplier,
    spreadModifier?.firstAttackMultiplier,
  ]
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0 && value !== 1);
  if (spreadValues.length) {
    const averageSpread = spreadValues.reduce((sum, value) => sum + value, 0) / spreadValues.length;
    effects.push({ key: 'spread', label: 'Spread', value: percentFromMultiplier(averageSpread), unit: 'percent' });
  }

  const recoilModifier = readObject(weaponStats.recoilModifier);
  const recoilValues = [
    recoilModifier?.decayMultiplier,
    recoilModifier?.endDecayMultiplier,
    recoilModifier?.randomnessMultiplier,
    recoilModifier?.fireRecoilTimeMultiplier,
    recoilModifier?.fireRecoilStrengthMultiplier,
    recoilModifier?.angleRecoilStrengthMultiplier,
    recoilModifier?.fireRecoilStrengthFirstMultiplier,
  ]
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0 && value !== 1);
  if (recoilValues.length) {
    const averageRecoil = recoilValues.reduce((sum, value) => sum + value, 0) / recoilValues.length;
    effects.push({ key: 'recoil', label: 'Recoil', value: percentFromMultiplier(averageRecoil), unit: 'percent' });
  }

  return {
    uuid: String(row.uuid),
    class_name: String(row.class_name),
    name: String(row.name),
    display_name: String(row.display_name ?? cleanItemDisplayName(String(row.name))),
    slot: inferAttachmentSlot(dataJson),
    manufacturer_code: row.manufacturer_code ?? null,
    manufacturer_name: row.manufacturer_name ?? null,
    fire_rate_bonus: fireRateBonus,
    damage_bonus: damageBonus,
    effects,
  };
}

export class ItemQueryService {
  constructor(private getClient: (env: string) => PrismaClient) {}

  private async getInsightPage(
    table: 'game.ammo' | 'game.inventory_containers',
    opts: { env?: string; search?: string; page?: number; limit?: number },
    searchColumns: string[],
    orderBy: string,
  ): Promise<PaginatedResult> {
    const { env = 'live', search, page = 1, limit = 50 } = opts;
    const prisma = this.getClient(env);
    const safeLimit = Math.min(Math.max(1, limit), 200);
    const offset = (page - 1) * safeLimit;
    const where = ['env = ?'];
    const params: (string | number)[] = [env];

    if (search) {
      const q = `%${search.replace(/[%_]/g, '\\$&')}%`;
      where.push(`(${searchColumns.map((column) => `${column} ILIKE ?`).join(' OR ')})`);
      params.push(...searchColumns.map(() => q));
    }

    const whereClause = where.join(' AND ');
    const [countRows, rows] = await Promise.all([
      prisma.$queryRawUnsafe<Row[]>(toPostgres(`SELECT COUNT(*) as total FROM ${table} WHERE ${whereClause}`), ...params),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT * FROM ${table} WHERE ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`),
        ...params,
        safeLimit,
        offset,
      ),
    ]);
    const total = Number(countRows[0]?.total ?? 0);
    return { data: convertBigIntToNumber(rows), total, page, limit: safeLimit, pages: Math.ceil(total / safeLimit) };
  }

  private normalizeItemRow(row: Row): Row {
    const name = String(row.name ?? '');
    return {
      ...row,
      display_name: cleanItemDisplayName(name),
    };
  }

  async getAllItems(filters?: {
    env?: string;
    type?: string;
    types?: string;
    sub_type?: string;
    sub_types?: string;
    exclude_sub_types?: string;
    item_group?: string;
    manufacturer?: string;
    search?: string;
    sort?: string;
    order?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult> {
    const env = filters?.env ?? 'live';
    const prisma = this.getClient(env);
    const where: string[] = ['i.env = ?'];
    const params: (string | number)[] = [env];
    let resolvedTypes = filters?.types;
    let resolvedType = filters?.type;
    let resolvedSubTypes = filters?.sub_types;
    let resolvedExcludeSubTypes = filters?.exclude_sub_types;

    if (filters?.item_group) {
      const navigation = await this.getItemNavigation(env);
      const group = navigation.groups[filters.item_group];
      if (group) {
        resolvedTypes = group.types?.join(',');
        resolvedType = group.type;
        resolvedSubTypes = group.subTypes?.join(',');
        resolvedExcludeSubTypes = group.excludeSubTypes?.join(',');
      }
    }

    if (resolvedTypes) {
      const typeList = resolvedTypes
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (typeList.length === 1) {
        where.push('i.type = ?');
        params.push(typeList[0]);
      } else if (typeList.length > 1) {
        where.push(`i.type IN (${typeList.map(() => '?').join(', ')})`);
        params.push(...typeList);
      }
    } else if (resolvedType) {
      where.push('i.type = ?');
      params.push(resolvedType);
    }
    if (resolvedSubTypes) {
      const stList = resolvedSubTypes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (stList.length === 1) {
        where.push('i.sub_type = ?');
        params.push(stList[0]);
      } else if (stList.length > 1) {
        where.push(`i.sub_type IN (${stList.map(() => '?').join(', ')})`);
        params.push(...stList);
      }
    } else if (filters?.sub_type) {
      where.push('i.sub_type = ?');
      params.push(filters.sub_type);
    }
    if (resolvedExcludeSubTypes) {
      const exList = resolvedExcludeSubTypes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (exList.length === 1) {
        where.push('(i.sub_type != ? OR i.sub_type IS NULL)');
        params.push(exList[0]);
      } else if (exList.length > 1) {
        where.push(`(i.sub_type NOT IN (${exList.map(() => '?').join(', ')}) OR i.sub_type IS NULL)`);
        params.push(...exList);
      }
    }
    if (filters?.manufacturer) {
      where.push('i.manufacturer_code = ?');
      params.push(filters.manufacturer.toUpperCase());
    }
    if (filters?.search) {
      const t = `%${filters.search}%`;
      params.push(t, t);
      where.push('(i.name ILIKE ? OR i.class_name ILIKE ?)');
    }

    const w = ` WHERE ${where.join(' AND ')}`;
    const baseSql = `SELECT i.*, m.name as manufacturer_name, ${itemMarketAggregateSelect()} FROM game.items i LEFT JOIN game.manufacturers m ON i.manufacturer_code = m.code ${ITEM_MARKET_JOIN}${w}`;
    const countSql = `SELECT COUNT(*) as total FROM game.items i${w}`;

    const result = await paginate(prisma, baseSql, countSql, params, filters || {}, ITEM_SORT, 'i', ITEM_JSON_SORT_MAP);
    return {
      ...result,
      data: result.data.map((row) => this.normalizeItemRow(row)),
    };
  }

  async getAmmoStats(opts: { env?: string; search?: string; page?: number; limit?: number }): Promise<PaginatedResult> {
    return this.getInsightPage('game.ammo', opts, ['name', 'class_name', 'ammo_category'], 'COALESCE(name, class_name) ASC');
  }

  async getInventoryContainers(opts: { env?: string; search?: string; page?: number; limit?: number }): Promise<PaginatedResult> {
    return this.getInsightPage(
      'game.inventory_containers',
      opts,
      ['name', 'class_name', 'inventory_type'],
      'COALESCE(capacity_micro_scu, 0) DESC, COALESCE(name, class_name) ASC',
    );
  }

  async getWeaponAttachmentModifiers(env = 'live'): Promise<WeaponAttachmentModifier[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT i.uuid, i.class_name, i.name, i.manufacturer_code, i.data_json,
             m.name as manufacturer_name
        FROM game.items i
        LEFT JOIN game.manufacturers m ON i.manufacturer_code = m.code
        WHERE i.env = ? AND i.type = 'Attachment' AND i.sub_type = 'Weapon Modifier'
        ORDER BY i.name`),
      env,
    );

    return rows
      .map((row) => extractWeaponAttachmentModifier(this.normalizeItemRow(row)))
      .sort((left, right) => {
        if (left.slot !== right.slot) return left.slot.localeCompare(right.slot);
        const leftHasEffects = left.effects.length > 0 ? 0 : 1;
        const rightHasEffects = right.effects.length > 0 ? 0 : 1;
        if (leftHasEffects !== rightHasEffects) return leftHasEffects - rightHasEffects;
        return left.display_name.localeCompare(right.display_name);
      });
  }

  async getItemByUuid(uuid: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(
        `SELECT i.*, m.name as manufacturer_name FROM game.items i LEFT JOIN game.manufacturers m ON i.manufacturer_code = m.code WHERE i.uuid = ? AND i.env = ?`,
      ),
      uuid,
      env,
    );
    return rows[0] ? this.normalizeItemRow(stripInternal(rows[0])) : null;
  }

  async getItemByClassName(className: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(
        `SELECT i.*, m.name as manufacturer_name FROM game.items i LEFT JOIN game.manufacturers m ON i.manufacturer_code = m.code WHERE i.class_name = ? AND i.env = ?`,
      ),
      className,
      env,
    );
    return rows[0] ? this.normalizeItemRow(stripInternal(rows[0])) : null;
  }

  async resolveItem(id: string, env = 'live'): Promise<Row | null> {
    return id.length === 36 ? this.getItemByUuid(id, env) : this.getItemByClassName(id, env);
  }

  async getItemFilters(env = 'live'): Promise<FiltersResult> {
    const prisma = this.getClient(env);
    const [typeRows, subTypeRows, mfrRows] = await Promise.all([
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(
          `SELECT type as value, COUNT(*) as count FROM game.items WHERE env = ? AND type IS NOT NULL GROUP BY type ORDER BY type`,
        ),
        env,
      ),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(
          `SELECT sub_type as value, COUNT(*) as count FROM game.items WHERE env = ? AND sub_type IS NOT NULL AND sub_type != '' GROUP BY sub_type ORDER BY sub_type`,
        ),
        env,
      ),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT i.manufacturer_code as value, COALESCE(m.name, i.manufacturer_code) as label, COUNT(i.uuid) as count
         FROM game.items i
         LEFT JOIN game.manufacturers m ON m.code = i.manufacturer_code
         WHERE i.env = ? AND i.manufacturer_code IS NOT NULL
         GROUP BY i.manufacturer_code, m.name
         ORDER BY COALESCE(m.name, i.manufacturer_code)`),
        env,
      ),
    ]);
    return {
      filters: {
        type: typeRows.map((r) => ({ value: String(r.value), label: String(r.value), count: Number(r.count) })),
        sub_type: subTypeRows.map((r) => ({ value: String(r.value), label: String(r.value), count: Number(r.count) })),
        manufacturer: mfrRows.map((r) => ({ value: String(r.value), label: String(r.label), count: Number(r.count) })),
      },
    };
  }

  async getItemsByManufacturer(code: string, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT i.uuid, i.class_name, i.name, i.type, i.sub_type, i.size, i.grade,
              i.manufacturer_code, m.name as manufacturer_name,
              i.weapon_damage, i.weapon_dps, i.weapon_fire_rate, i.weapon_range,
              i.armor_damage_reduction, i.armor_temp_min, i.armor_temp_max
       FROM game.items i LEFT JOIN game.manufacturers m ON i.manufacturer_code = m.code
       WHERE i.env = ? AND i.manufacturer_code = ?
       ORDER BY i.type, i.sub_type, i.name`),
      env,
      code.toUpperCase(),
    );
    return rows.map((row) => this.normalizeItemRow(row));
  }

  async getItemTypes(env = 'live'): Promise<{ types: { type: string; count: number }[] }> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT type, COUNT(*) as count FROM game.items WHERE env = ? GROUP BY type ORDER BY count DESC`),
      env,
    );
    return { types: rows.map((r) => ({ type: String(r.type), count: Number(r.count) })) };
  }

  async getCategoryCounts(env = 'live'): Promise<Record<string, number>> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<{ type: string; sub_type: string | null; cnt: number }[]>(
      toPostgres('SELECT type, sub_type, COUNT(*) as cnt FROM game.items WHERE env = ? GROUP BY type, sub_type'),
      env,
    );
    const byType = new Map<string, number>();
    for (const r of rows) {
      byType.set(r.type, (byType.get(r.type) || 0) + Number(r.cnt));
    }
    const byTypeSub = new Map<string, number>();
    for (const r of rows) {
      const key = `${r.type}::${r.sub_type ?? ''}`;
      byTypeSub.set(key, Number(r.cnt));
    }
    const sub = (type: string, subType: string) => byTypeSub.get(`${type}::${subType}`) || 0;
    const type = (t: string) => byType.get(t) || 0;

    const throwables = sub('FPS_Weapon', 'Throwable') + sub('FPS_Weapon', 'Mine');
    const fpsWeaponTotal = type('FPS_Weapon');
    const weaponsAll = fpsWeaponTotal - throwables;
    const gadgetHand = sub('Gadget', 'Handheld') + sub('Gadget', 'Two-handed') + sub('Gadget', 'Device');
    const medicalSubs = sub('Consumable', 'Medical') + sub('Consumable', 'MedPack') + sub('Consumable', 'Stim') + sub('Tool', 'Medical');
    const cryptokeys = sub('Consumable', 'Hacking') + sub('Consumable', 'SystemAccess');
    const techSubs = sub('Tool', 'Multitool') + sub('Tool', 'Module') + sub('Gadget', 'Device');
    const foodDrinkOxy = sub('Consumable', 'Food') + sub('Consumable', 'Drink') + sub('Consumable', 'OxygenCap');
    const appearanceFlair = sub('Attachment', 'Appearance');

    return {
      // Armor
      armor:
        type('Armor') +
        type('Armor_Helmet') +
        type('Armor_Torso') +
        type('Armor_Arms') +
        type('Armor_Legs') +
        type('Armor_Backpack') +
        type('Undersuit'),
      'armor-suits': type('Armor'),
      'armor-helmets': type('Armor_Helmet'),
      'armor-core': type('Armor_Torso'),
      'armor-arms': type('Armor_Arms'),
      'armor-legs': type('Armor_Legs'),
      'armor-backpacks': type('Armor_Backpack'),
      'armor-undersuits': type('Undersuit'),
      'armor-flair': appearanceFlair,
      // Clothing
      clothing: type('Clothing'),
      // Weapons
      weapons: weaponsAll,
      'weapons-sidearms': sub('FPS_Weapon', 'Pistol'),
      'weapons-primary':
        sub('FPS_Weapon', 'Assault Rifle') +
        sub('FPS_Weapon', 'SMG') +
        sub('FPS_Weapon', 'Shotgun') +
        sub('FPS_Weapon', 'Sniper Rifle') +
        sub('FPS_Weapon', 'LMG'),
      'weapons-primary-ar': sub('FPS_Weapon', 'Assault Rifle'),
      'weapons-primary-smg': sub('FPS_Weapon', 'SMG'),
      'weapons-primary-shotgun': sub('FPS_Weapon', 'Shotgun'),
      'weapons-primary-sniper': sub('FPS_Weapon', 'Sniper Rifle'),
      'weapons-primary-lmg': sub('FPS_Weapon', 'LMG'),
      'weapons-special': sub('FPS_Weapon', 'Launcher'),
      'weapons-melee': sub('FPS_Weapon', 'Melee'),
      'weapons-attachments': sub('Attachment', 'Weapon Modifier'),
      'weapons-throwables': throwables,
      // Utility
      utility: type('Tool') + type('Gadget') + type('Consumable') - foodDrinkOxy,
      'utility-gadgets': gadgetHand,
      'utility-medical': medicalSubs,
      'utility-cryptokeys': cryptokeys,
      'utility-technology': techSubs,
      // Ammo
      ammo: type('Magazine'),
      // Sustenance
      sustenance: foodDrinkOxy,
      'sustenance-food': sub('Consumable', 'Food'),
      'sustenance-drink': sub('Consumable', 'Drink'),
      'sustenance-oxygen': sub('Consumable', 'OxygenCap'),
      // Other
      other: type('Gadget') - gadgetHand - (sub('Gadget', 'Device') - 0), // residual gadgets
    };
  }

  async getItemSubTypes(type?: string, env = 'live'): Promise<{ sub_types: { value: string; count: number }[] }> {
    const prisma = this.getClient(env);
    const sql = type
      ? `SELECT sub_type as value, COUNT(*) as count FROM game.items WHERE env = ? AND type = ? AND sub_type IS NOT NULL AND sub_type != '' GROUP BY sub_type ORDER BY count DESC`
      : `SELECT sub_type as value, COUNT(*) as count FROM game.items WHERE env = ? AND sub_type IS NOT NULL AND sub_type != '' GROUP BY sub_type ORDER BY count DESC`;
    const rows = type
      ? await prisma.$queryRawUnsafe<Row[]>(toPostgres(sql), env, type)
      : await prisma.$queryRawUnsafe<Row[]>(toPostgres(sql), env);
    return { sub_types: rows.map((r) => ({ value: String(r.value), count: Number(r.count) })) };
  }

  async getItemManufacturers(type?: string, env = 'live'): Promise<{ manufacturers: { code: string; name: string; count: number }[] }> {
    const prisma = this.getClient(env);
    const where: string[] = ['i.env = ?', 'i.manufacturer_code IS NOT NULL'];
    const params: string[] = [env];
    const categoryFilter = type ? ITEM_CATEGORY_FILTERS[type] : undefined;

    if (categoryFilter) {
      if (categoryFilter.types.length === 1) {
        where.push('i.type = ?');
        params.push(categoryFilter.types[0]);
      } else {
        where.push(`i.type IN (${categoryFilter.types.map(() => '?').join(', ')})`);
        params.push(...categoryFilter.types);
      }
      if (categoryFilter.subTypes?.length) {
        where.push(`i.sub_type IN (${categoryFilter.subTypes.map(() => '?').join(', ')})`);
        params.push(...categoryFilter.subTypes);
      }
      if (categoryFilter.excludeSubTypes?.length) {
        where.push(`(i.sub_type NOT IN (${categoryFilter.excludeSubTypes.map(() => '?').join(', ')}) OR i.sub_type IS NULL)`);
        params.push(...categoryFilter.excludeSubTypes);
      }
    } else if (type) {
      where.push('i.type = ?');
      params.push(type);
    }

    const sql = `SELECT i.manufacturer_code as code, COALESCE(m.name, i.manufacturer_code) as name, COUNT(*) as count
       FROM game.items i LEFT JOIN game.manufacturers m ON m.code = i.manufacturer_code
       WHERE ${where.join(' AND ')}
       GROUP BY i.manufacturer_code, m.name
       ORDER BY COALESCE(m.name, i.manufacturer_code)`;
    const rows = await prisma.$queryRawUnsafe<Row[]>(toPostgres(sql), ...params);
    return { manufacturers: rows.map((r) => ({ code: String(r.code), name: String(r.name), count: Number(r.count) })) };
  }

  async getItemBuyLocationResult(uuid: string, env = 'live'): Promise<ItemBuyLocationResult> {
    const prisma = this.getClient(env);
    let uexStatus: ItemBuyLocationSourceMeta = { status: 'not_checked', count: null };
    try {
      const uexRows = await prisma.$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT
              COALESCE(p.terminal_uex_id, -p.id) as shop_id,
              COALESCE(t.name, p.terminal_name, 'UEX market') as shop_name,
              COALESCE(t.city, t.outpost, t.space_station, t.moon, t.planet, t.star_system, p.terminal_name) as location,
              t.star_system as system_name,
              t.city,
              COALESCE(t.moon, t.planet, t.orbit) as planet_moon,
              t.type as shop_type,
              p.resource as terminal,
              'uex' as inventory_kind,
              COALESCE(p.price_buy, p.price, p.price_average) as base_price,
              p.price_sell as sell_price,
              NULL::numeric as current_inventory,
              NULL::numeric as max_inventory,
              NULL::numeric as rental_price_1d,
              NULL::numeric as rental_price_3d,
              NULL::numeric as rental_price_7d,
              NULL::numeric as rental_price_30d,
              'uex' as source,
              1::numeric as confidence,
              p.date_modified as updated_at
       FROM game.uex_market_prices p
       LEFT JOIN game.uex_terminals t ON t.uex_id = p.terminal_uex_id AND t.env = p.env
       WHERE p.env = ? AND p.entity_kind = 'item' AND p.entity_uuid = ? AND p.is_available = TRUE
       ORDER BY COALESCE(p.price_buy, p.price, p.price_average) NULLS LAST, t.star_system, t.city, t.name`),
        env,
        uuid,
      );
      if (uexRows.length) {
        const data = convertBigIntToNumber(uexRows);
        return {
          data,
          source: 'uex',
          sourcePriority: ['uex', 'p4k'],
          fallbackUsed: false,
          reason: 'uex_available',
          sources: {
            uex: { status: 'available', count: data.length },
            p4k: { status: 'not_checked', count: null },
          },
        };
      }
      uexStatus = { status: 'empty', count: 0 };
    } catch {
      // Older deployments without generic UEX market rows fall back to P4K shop inventory.
      uexStatus = { status: 'unavailable', count: null, error: 'query_failed' };
    }
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT s.id as shop_id, s.name as shop_name, s.location, s.planet_moon,
              s.system as system_name, s.city, s.shop_type,
              s.canonical_shop_key, s.canonical_location_key,
              si.inventory_kind, si.base_price, si.sell_price, si.current_inventory, si.max_inventory,
              si.rental_price_1d, si.rental_price_3d, si.rental_price_7d, si.rental_price_30d,
              si.source, si.confidence
       FROM game.shop_inventory si
       JOIN game.shops s ON si.shop_id = s.id
       WHERE s.env = ? AND si.component_uuid = ?
       ORDER BY si.base_price`),
      env,
      uuid,
    );
    const p4kRows = convertBigIntToNumber(rows);
    if (p4kRows.length) {
      return {
        data: p4kRows,
        source: 'p4k',
        sourcePriority: ['uex', 'p4k'],
        fallbackUsed: true,
        reason: uexStatus.status === 'unavailable' ? 'uex_unavailable_p4k_available' : 'uex_empty_p4k_available',
        sources: {
          uex: uexStatus,
          p4k: { status: 'available', count: p4kRows.length },
        },
      };
    }
    return {
      data: [],
      source: 'none',
      sourcePriority: ['uex', 'p4k'],
      fallbackUsed: uexStatus.status !== 'not_checked',
      reason: 'no_uex_or_p4k_location_found',
      sources: {
        uex: uexStatus,
        p4k: { status: 'empty', count: 0 },
      },
    };
  }

  async getItemBuyLocations(uuid: string, env = 'live'): Promise<Row[]> {
    return (await this.getItemBuyLocationResult(uuid, env)).data;
  }

  async getItemNavigation(env = 'live'): Promise<{
    fpsCategories: { slug: string; label: string; count: number }[];
    otherCategories: { slug: string; label: string; count: number }[];
    fpsSubTypeOptions: Record<string, { label: string; value: string }[]>;
    consumableFilterOptions: Record<string, { label: string; value: string }[]>;
    groups: Record<string, { type?: string; types?: string[]; subTypes?: string[]; excludeSubTypes?: string[] }>;
  }> {
    const [categoryCounts, filters, consumableSubTypes] = await Promise.all([
      this.getCategoryCounts(env),
      this.getItemFilters(env),
      this.getItemSubTypes('Consumable', env),
    ]);
    const typeCounts = Object.fromEntries((filters.filters.type ?? []).map((entry) => [entry.value, Number(entry.count ?? 0)]));
    const consumableEntries = consumableSubTypes.sub_types
      .map((entry) => ({ value: entry.value, count: Number(entry.count) }))
      .filter((entry) => entry.count > 0);
    const otherTypes = (filters.filters.type ?? []).map((entry) => entry.value).filter((type) => !FPS_COVERED_TYPES.has(type));
    const nonConsumableOtherTypes = otherTypes.filter((type) => type !== 'Consumable');
    const otherCount = nonConsumableOtherTypes.reduce((sum, value) => sum + (typeCounts[value] ?? 0), 0);
    const orderedConsumableEntries = orderConsumableEntries(consumableEntries.filter((entry) => !CHIP_SUBTYPES.includes(entry.value)));
    type NavCategory = { slug: string; label: string; count: number; group: string; parentSlug?: string };

    const c = (slug: string) => categoryCounts[slug] ?? 0;

    const fpsCategories: NavCategory[] = [
      // ── Armor ────────────────────────────────────────────────────────────────
      { slug: 'armor', label: 'Armor', group: 'armor', count: c('armor') },
      { slug: 'armor-suits', label: 'Suits', group: 'armor', count: c('armor-suits') },
      { slug: 'armor-undersuits', label: 'Undersuits', group: 'armor', count: c('armor-undersuits') },
      { slug: 'armor-helmets', label: 'Helmets', group: 'armor', count: c('armor-helmets') },
      { slug: 'armor-core', label: 'Core', group: 'armor', count: c('armor-core') },
      { slug: 'armor-arms', label: 'Arms', group: 'armor', count: c('armor-arms') },
      { slug: 'armor-legs', label: 'Legs', group: 'armor', count: c('armor-legs') },
      { slug: 'armor-backpacks', label: 'Backpacks', group: 'armor', count: c('armor-backpacks') },
      { slug: 'armor-flair', label: 'Flair', group: 'armor', count: c('armor-flair') },
      // ── Clothing ─────────────────────────────────────────────────────────────
      { slug: 'clothing', label: 'Clothing', group: 'clothing', count: c('clothing') },
      // ── Weapons ──────────────────────────────────────────────────────────────
      { slug: 'weapons', label: 'Weapons', group: 'weapons', count: c('weapons') },
      { slug: 'weapons-sidearms', label: 'Sidearms', group: 'weapons', count: c('weapons-sidearms') },
      { slug: 'weapons-primary', label: 'Primary', group: 'weapons', count: c('weapons-primary') },
      {
        slug: 'weapons-primary-ar',
        label: 'Assault Rifles',
        group: 'weapons-primary',
        count: c('weapons-primary-ar'),
        parentSlug: 'weapons-primary',
      },
      {
        slug: 'weapons-primary-smg',
        label: 'SMGs',
        group: 'weapons-primary',
        count: c('weapons-primary-smg'),
        parentSlug: 'weapons-primary',
      },
      {
        slug: 'weapons-primary-shotgun',
        label: 'Shotguns',
        group: 'weapons-primary',
        count: c('weapons-primary-shotgun'),
        parentSlug: 'weapons-primary',
      },
      {
        slug: 'weapons-primary-sniper',
        label: 'Sniper Rifles',
        group: 'weapons-primary',
        count: c('weapons-primary-sniper'),
        parentSlug: 'weapons-primary',
      },
      {
        slug: 'weapons-primary-lmg',
        label: 'LMGs',
        group: 'weapons-primary',
        count: c('weapons-primary-lmg'),
        parentSlug: 'weapons-primary',
      },
      { slug: 'weapons-special', label: 'Special', group: 'weapons', count: c('weapons-special') },
      { slug: 'weapons-melee', label: 'Melee', group: 'weapons', count: c('weapons-melee') },
      { slug: 'weapons-attachments', label: 'Attachments', group: 'weapons', count: c('weapons-attachments') },
      { slug: 'weapons-throwables', label: 'Throwables', group: 'weapons', count: c('weapons-throwables') },
      // ── Utility ──────────────────────────────────────────────────────────────
      { slug: 'utility', label: 'Utility', group: 'utility', count: c('utility') },
      { slug: 'utility-gadgets', label: 'Gadgets', group: 'utility', count: c('utility-gadgets') },
      { slug: 'utility-medical', label: 'Medical', group: 'utility', count: c('utility-medical') },
      { slug: 'utility-cryptokeys', label: 'Cryptokeys', group: 'utility', count: c('utility-cryptokeys') },
      { slug: 'utility-technology', label: 'Technology', group: 'utility', count: c('utility-technology') },
      // ── Ammo ─────────────────────────────────────────────────────────────────
      { slug: 'ammo', label: 'Ammo', group: 'ammo', count: c('ammo') },
      // ── Sustenance ───────────────────────────────────────────────────────────
      { slug: 'sustenance', label: 'Sustenance', group: 'sustenance', count: c('sustenance') },
      { slug: 'sustenance-food', label: 'Food', group: 'sustenance', count: c('sustenance-food') },
      { slug: 'sustenance-drink', label: 'Drinks', group: 'sustenance', count: c('sustenance-drink') },
      { slug: 'sustenance-oxygen', label: 'Oxygen', group: 'sustenance', count: c('sustenance-oxygen') },
      // ── Other ─────────────────────────────────────────────────────────────────
      { slug: 'other', label: 'Other', group: 'other', count: c('other') },
    ];

    // Keep otherCategories for backward compat (currently unused by new pages)
    const otherCategories = [
      { slug: 'all', label: 'All', count: consumableEntries.reduce((sum, entry) => sum + entry.count, 0) + otherCount, group: 'other' },
    ];

    const consumableFilterOptions: Record<string, { label: string; value: string }[]> = {
      all: consumableEntries.map((entry) => ({ label: formatConsumableLabel(entry.value), value: entry.value })),
    };

    const groups: Record<string, { type?: string; types?: string[]; subTypes?: string[]; excludeSubTypes?: string[] }> = {
      ...TAXONOMY_GROUPS,
      // Legacy
      other_all: { types: otherTypes },
    };
    for (const entry of orderedConsumableEntries) groups[`other_sub:${entry.value}`] = { type: 'Consumable', subTypes: [entry.value] };

    return { fpsCategories, otherCategories, fpsSubTypeOptions: FPS_SUBTYPE_OPTIONS, consumableFilterOptions, groups };
  }
}
