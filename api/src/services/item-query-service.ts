/**
 * ItemQueryService — FPS weapons, armor, clothing, attachments, gadgets, consumables
 */
import type { PrismaLike as PrismaClient } from '@starvis/db';
import { cleanItemDisplayName } from '../normalizers/items.js';
import { type FiltersResult, type PaginatedResult, paginate, type Row, stripInternal, toPostgres } from './shared.js';

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
const FPS_SUBTYPE_OPTIONS: Record<string, { label: string; value: string }[]> = {
  weapons: ['Pistol', 'SMG', 'Shotgun', 'Sniper Rifle', 'Assault Rifle', 'LMG', 'Launcher', 'Melee', 'Medium', 'Large', 'Small'].map(
    (s) => ({
      label: s,
      value: s,
    }),
  ),
  throwable: [
    { label: 'Grenades', value: 'Throwable' },
    { label: 'Mines', value: 'Mine' },
  ],
  helmet: [
    { label: 'Light', value: 'Light' },
    { label: 'Medium', value: 'Medium' },
    { label: 'Heavy', value: 'Heavy' },
  ],
  core: [
    { label: 'Light', value: 'Light' },
    { label: 'Medium', value: 'Medium' },
    { label: 'Heavy', value: 'Heavy' },
  ],
  arms: [
    { label: 'Light', value: 'Light' },
    { label: 'Medium', value: 'Medium' },
    { label: 'Heavy', value: 'Heavy' },
  ],
  legs: [
    { label: 'Light', value: 'Light' },
    { label: 'Medium', value: 'Medium' },
    { label: 'Heavy', value: 'Heavy' },
  ],
  backpack: [
    { label: 'Light', value: 'Light' },
    { label: 'Medium', value: 'Medium' },
    { label: 'Heavy', value: 'Heavy' },
  ],
};

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

export class ItemQueryService {
  constructor(private getClient: (env: string) => PrismaClient) {}

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
    const baseSql = `SELECT i.*, m.name as manufacturer_name FROM game.items i LEFT JOIN game.manufacturers m ON i.manufacturer_code = m.code${w}`;
    const countSql = `SELECT COUNT(*) as total FROM game.items i${w}`;

    const result = await paginate(prisma, baseSql, countSql, params, filters || {}, ITEM_SORT, 'i', ITEM_JSON_SORT_MAP);
    return {
      ...result,
      data: result.data.map((row) => this.normalizeItemRow(row)),
    };
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
    const droppable = (byTypeSub.get('FPS_Weapon::Throwable') || 0) + (byTypeSub.get('FPS_Weapon::Mine') || 0);
    const fpsGadget = byTypeSub.get('FPS_Weapon::Gadget') || 0;
    const consumableFoodDrink = (byTypeSub.get('Consumable::Food') || 0) + (byTypeSub.get('Consumable::Drink') || 0);
    const consumableMission = (byTypeSub.get('Consumable::Hacking') || 0) + (byTypeSub.get('Consumable::SystemAccess') || 0);
    const weaponTotal = byType.get('FPS_Weapon') || 0;
    return {
      weapons: weaponTotal - droppable - fpsGadget,
      throwable: droppable,
      helmet: byType.get('Armor_Helmet') || 0,
      core: byType.get('Armor_Torso') || 0,
      arms: byType.get('Armor_Arms') || 0,
      legs: byType.get('Armor_Legs') || 0,
      backpack: byType.get('Armor_Backpack') || 0,
      undersuit: byType.get('Undersuit') || 0,
      'tools-medics':
        (byType.get('Tool') || 0) +
        (byType.get('Consumable') || 0) -
        consumableFoodDrink -
        consumableMission +
        (byType.get('Gadget') || 0) +
        fpsGadget,
      magazines: byType.get('Magazine') || 0,
      attachments: byType.get('Attachment') || 0,
      clothing: byType.get('Clothing') || 0,
      other: 0,
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
    const sql = type
      ? `SELECT i.manufacturer_code as code, COALESCE(m.name, i.manufacturer_code) as name, COUNT(*) as count
         FROM game.items i LEFT JOIN game.manufacturers m ON m.code = i.manufacturer_code
         WHERE i.env = ? AND i.type = ? AND i.manufacturer_code IS NOT NULL
         GROUP BY i.manufacturer_code, m.name
         ORDER BY COALESCE(m.name, i.manufacturer_code)`
      : `SELECT i.manufacturer_code as code, COALESCE(m.name, i.manufacturer_code) as name, COUNT(*) as count
         FROM game.items i LEFT JOIN game.manufacturers m ON m.code = i.manufacturer_code
         WHERE i.env = ? AND i.manufacturer_code IS NOT NULL
         GROUP BY i.manufacturer_code, m.name
         ORDER BY COALESCE(m.name, i.manufacturer_code)`;
    const rows = type
      ? await prisma.$queryRawUnsafe<Row[]>(toPostgres(sql), env, type)
      : await prisma.$queryRawUnsafe<Row[]>(toPostgres(sql), env);
    return { manufacturers: rows.map((r) => ({ code: String(r.code), name: String(r.name), count: Number(r.count) })) };
  }

  async getItemBuyLocations(uuid: string, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT s.id as shop_id, s.name as shop_name, s.location, s.planet_moon,
              s.system as system_name, s.city, s.shop_type,
              s.canonical_shop_key, s.canonical_location_key,
              si.base_price, si.rental_price_1d
       FROM game.shop_inventory si
       JOIN game.shops s ON si.shop_id = s.id
       WHERE si.env = ? AND si.component_uuid = ?
       ORDER BY si.base_price`),
      env,
      uuid,
    );
    return rows;
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
    const consumableCountMap = Object.fromEntries(consumableEntries.map((entry) => [entry.value, entry.count]));
    const otherTypes = (filters.filters.type ?? []).map((entry) => entry.value).filter((type) => !FPS_COVERED_TYPES.has(type));
    const nonConsumableOtherTypes = otherTypes.filter((type) => type !== 'Consumable');
    const chipCount = CHIP_SUBTYPES.reduce((sum, value) => sum + (consumableCountMap[value] ?? 0), 0);
    const otherCount = nonConsumableOtherTypes.reduce((sum, value) => sum + (typeCounts[value] ?? 0), 0);
    const orderedConsumableEntries = orderConsumableEntries(consumableEntries.filter((entry) => !CHIP_SUBTYPES.includes(entry.value)));
    const fpsCategories = [
      { slug: 'all', label: 'All', count: Object.values(categoryCounts).reduce((sum, count) => sum + count, 0) },
      ...[
        { slug: 'weapons', label: 'Weapons' },
        { slug: 'throwable', label: 'Throwable' },
        { slug: 'helmet', label: 'Helmet' },
        { slug: 'core', label: 'Torso' },
        { slug: 'arms', label: 'Arms' },
        { slug: 'legs', label: 'Legs' },
        { slug: 'backpack', label: 'Backpack' },
        { slug: 'undersuit', label: 'Undersuit' },
        { slug: 'tools-medics', label: 'Tools & Medics' },
        { slug: 'attachments', label: 'Attachment' },
        { slug: 'magazines', label: 'Magazines' },
        { slug: 'clothing', label: 'Clothing' },
        { slug: 'other', label: 'Other' },
      ].map((category) => ({ ...category, count: categoryCounts[category.slug] ?? 0 })),
    ];
    const otherCategories = [
      {
        slug: 'all',
        label: 'All',
        count: consumableEntries.reduce((sum, entry) => sum + entry.count, 0) + otherCount,
      },
      ...(chipCount > 0 ? [{ slug: 'chips', label: 'Chips', count: chipCount }] : []),
      ...orderedConsumableEntries.map((entry) => ({
        slug: `sub:${entry.value}`,
        label: formatConsumableLabel(entry.value),
        count: entry.count,
      })),
      { slug: 'other', label: 'Other', count: otherCount },
    ];
    const consumableFilterOptions: Record<string, { label: string; value: string }[]> = {
      chips: CHIP_SUBTYPES.filter((value) => (consumableCountMap[value] ?? 0) > 0).map((value) => ({
        label: formatConsumableLabel(value),
        value,
      })),
      all: consumableEntries.map((entry) => ({ label: formatConsumableLabel(entry.value), value: entry.value })),
    };
    const groups: Record<string, { type?: string; types?: string[]; subTypes?: string[]; excludeSubTypes?: string[] }> = {
      fps_all: { types: FPS_ALL_TYPES, excludeSubTypes: ['Food', 'Drink'] },
      other_all: { types: otherTypes },
      other_chips: { type: 'Consumable', subTypes: CHIP_SUBTYPES },
      other_other: { types: nonConsumableOtherTypes },
    };
    for (const entry of orderedConsumableEntries) groups[`other_sub:${entry.value}`] = { type: 'Consumable', subTypes: [entry.value] };

    return { fpsCategories, otherCategories, fpsSubTypeOptions: FPS_SUBTYPE_OPTIONS, consumableFilterOptions, groups };
  }
}
