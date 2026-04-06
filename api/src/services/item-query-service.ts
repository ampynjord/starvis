/**
 * ItemQueryService — FPS weapons, armor, clothing, attachments, gadgets, consumables
 */
import type { PrismaLike as PrismaClient } from '@starvis/db';
import { cleanItemDisplayName } from '../normalizers/items.js';
import { type FiltersResult, type PaginatedResult, paginate, type Row, stripInternal } from './shared.js';

const ITEM_JSON_SORT_MAP: Record<string, string> = {
  'game_data.weapon_damage':    "JSON_EXTRACT(i.game_data, '$.weapon_damage')",
  'game_data.weapon_dps':       "JSON_EXTRACT(i.game_data, '$.weapon_dps')",
  'game_data.weapon_fire_rate': "JSON_EXTRACT(i.game_data, '$.weapon_fire_rate')",
  'game_data.weapon_range':     "JSON_EXTRACT(i.game_data, '$.weapon_range')",
  'game_data.armor_dr':         "JSON_EXTRACT(i.game_data, '$.armor_damage_reduction')",
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
    manufacturer?: string;
    search?: string;
    sort?: string;
    order?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult> {
    const env = filters?.env ?? 'live';
    const prisma = this.getClient(env);
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.types) {
      const typeList = filters.types
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
    } else if (filters?.type) {
      where.push('i.type = ?');
      params.push(filters.type);
    }
    if (filters?.sub_types) {
      const stList = filters.sub_types
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
    if (filters?.exclude_sub_types) {
      const exList = filters.exclude_sub_types
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
      const searchParts: string[] = ['i.name LIKE ?', 'i.class_name LIKE ?'];
      const t = `%${filters.search}%`;
      params.push(t, t);

      where.push(`(${searchParts.join(' OR ')})`);
    }

    const w = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const baseSql = `SELECT i.*, m.name as manufacturer_name FROM items i LEFT JOIN starvis.manufacturers m ON i.manufacturer_code = m.code${w}`;
    const countSql = `SELECT COUNT(*) as total FROM items i${w}`;

    const result = await paginate(prisma, baseSql, countSql, params, filters || {}, ITEM_SORT, 'i', ITEM_JSON_SORT_MAP);
    return {
      ...result,
      data: result.data.map((row) => this.normalizeItemRow(row)),
    };
  }

  async getItemByUuid(uuid: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT i.*, m.name as manufacturer_name FROM items i LEFT JOIN starvis.manufacturers m ON i.manufacturer_code = m.code WHERE i.uuid = ?`,
      uuid,
    );
    return rows[0] ? this.normalizeItemRow(stripInternal(rows[0])) : null;
  }

  async getItemByClassName(className: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT i.*, m.name as manufacturer_name FROM items i LEFT JOIN starvis.manufacturers m ON i.manufacturer_code = m.code WHERE i.class_name = ?`,
      className,
    );
    return rows[0] ? this.normalizeItemRow(stripInternal(rows[0])) : null;
  }

  async resolveItem(id: string, env = 'live'): Promise<Row | null> {
    return id.length === 36 ? this.getItemByUuid(id, env) : this.getItemByClassName(id, env);
  }

  async getItemFilters(env = 'live'): Promise<FiltersResult> {
    const prisma = this.getClient(env);
    const [typeRows, subTypeRows, mfrRows] = await Promise.all([
      prisma.$queryRawUnsafe<Row[]>(`SELECT type as value, COUNT(*) as count FROM items WHERE type IS NOT NULL GROUP BY type ORDER BY type`),
      prisma.$queryRawUnsafe<Row[]>(`SELECT sub_type as value, COUNT(*) as count FROM items WHERE sub_type IS NOT NULL AND sub_type != '' GROUP BY sub_type ORDER BY sub_type`),
      prisma.$queryRawUnsafe<Row[]>(
        `SELECT i.manufacturer_code as value, COALESCE(m.name, i.manufacturer_code) as label, COUNT(i.uuid) as count
         FROM items i
         LEFT JOIN starvis.manufacturers m ON m.code = i.manufacturer_code
         WHERE i.manufacturer_code IS NOT NULL
         GROUP BY i.manufacturer_code, m.name
         ORDER BY COALESCE(m.name, i.manufacturer_code)`,
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
      `SELECT i.uuid, i.class_name, i.name, i.type, i.sub_type, i.size, i.grade,
              i.manufacturer_code, m.name as manufacturer_name,
              i.weapon_damage, i.weapon_dps, i.weapon_fire_rate, i.weapon_range,
              i.armor_damage_reduction, i.armor_temp_min, i.armor_temp_max
       FROM items i LEFT JOIN starvis.manufacturers m ON i.manufacturer_code = m.code
       WHERE i.manufacturer_code = ?
       ORDER BY i.type, i.sub_type, i.name`,
      code.toUpperCase(),
    );
    return rows.map((row) => this.normalizeItemRow(row));
  }

  async getItemTypes(env = 'live'): Promise<{ types: { type: string; count: number }[] }> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(`SELECT type, COUNT(*) as count FROM items GROUP BY type ORDER BY count DESC`);
    return { types: rows.map((r) => ({ type: String(r.type), count: Number(r.count) })) };
  }

  async getCategoryCounts(env = 'live'): Promise<Record<string, number>> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<{ type: string; sub_type: string | null; cnt: number }[]>(
      'SELECT type, sub_type, COUNT(*) as cnt FROM items GROUP BY type, sub_type',
    );
    // Mirror CATEGORY_DEFS logic — must match routes/items.ts CATEGORY_DEFS
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
    const weaponTotal = byType.get('FPS_Weapon') || 0;
    return {
      weapons: weaponTotal - droppable,
      throwable: droppable,
      helmet: byType.get('Armor_Helmet') || 0,
      core: byType.get('Armor_Torso') || 0,
      arms: byType.get('Armor_Arms') || 0,
      legs: byType.get('Armor_Legs') || 0,
      backpack: byType.get('Armor_Backpack') || 0,
      undersuit: byType.get('Undersuit') || 0,
      'tools-medics': (byType.get('Tool') || 0) + (byType.get('Consumable') || 0),
      magazines: byType.get('Magazine') || 0,
      attachments: byType.get('Attachment') || 0,
      clothing: byType.get('Clothing') || 0,
      other: byType.get('Gadget') || 0,
    };
  }

  async getItemSubTypes(type?: string, env = 'live'): Promise<{ sub_types: { value: string; count: number }[] }> {
    const prisma = this.getClient(env);
    const sql = type
      ? `SELECT sub_type as value, COUNT(*) as count FROM items WHERE type = ? AND sub_type IS NOT NULL AND sub_type != '' GROUP BY sub_type ORDER BY count DESC`
      : `SELECT sub_type as value, COUNT(*) as count FROM items WHERE sub_type IS NOT NULL AND sub_type != '' GROUP BY sub_type ORDER BY count DESC`;
    const rows = type ? await prisma.$queryRawUnsafe<Row[]>(sql, type) : await prisma.$queryRawUnsafe<Row[]>(sql);
    return { sub_types: rows.map((r) => ({ value: String(r.value), count: Number(r.count) })) };
  }

  async getItemManufacturers(type?: string, env = 'live'): Promise<{ manufacturers: { code: string; name: string; count: number }[] }> {
    const prisma = this.getClient(env);
    const sql = type
      ? `SELECT i.manufacturer_code as code, COALESCE(m.name, i.manufacturer_code) as name, COUNT(*) as count
         FROM items i LEFT JOIN starvis.manufacturers m ON m.code = i.manufacturer_code
         WHERE i.type = ? AND i.manufacturer_code IS NOT NULL
         GROUP BY i.manufacturer_code, m.name
         ORDER BY COALESCE(m.name, i.manufacturer_code)`
      : `SELECT i.manufacturer_code as code, COALESCE(m.name, i.manufacturer_code) as name, COUNT(*) as count
         FROM items i LEFT JOIN starvis.manufacturers m ON m.code = i.manufacturer_code
         WHERE i.manufacturer_code IS NOT NULL
         GROUP BY i.manufacturer_code, m.name
         ORDER BY COALESCE(m.name, i.manufacturer_code)`;
    const rows = type ? await prisma.$queryRawUnsafe<Row[]>(sql, type) : await prisma.$queryRawUnsafe<Row[]>(sql);
    return { manufacturers: rows.map((r) => ({ code: String(r.code), name: String(r.name), count: Number(r.count) })) };
  }

  async getItemBuyLocations(uuid: string, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT s.id as shop_id, s.name as shop_name, s.location, s.planet_moon,
              s.\`system\` as system_name, s.city, s.shop_type,
              s.canonical_shop_key, s.canonical_location_key,
              si.base_price, si.rental_price_1d
       FROM shop_inventory si
       JOIN shops s ON si.shop_id = s.id
       WHERE si.component_uuid = ?
       ORDER BY si.base_price`,
      uuid,
    );
    return rows;
  }
}
