/**
 * ItemQueryService — FPS weapons, armor, clothing, attachments, gadgets, consumables
 */
import type { PrismaClient } from '@prisma/client';
import { type PaginatedResult, paginate, type Row } from './shared.js';

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
  constructor(private prisma: PrismaClient) {}

  async getAllItems(filters?: {
    env?: string;
    type?: string;
    sub_type?: string;
    manufacturer?: string;
    search?: string;
    sort?: string;
    order?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult> {
    const env = filters?.env ?? 'live';
    const where: string[] = ['i.game_env = ?'];
    const params: (string | number)[] = [env];

    if (filters?.type) {
      where.push('i.type = ?');
      params.push(filters.type);
    }
    if (filters?.sub_type) {
      where.push('i.sub_type = ?');
      params.push(filters.sub_type);
    }
    if (filters?.manufacturer) {
      where.push('i.manufacturer_code = ?');
      params.push(filters.manufacturer.toUpperCase());
    }
    if (filters?.search) {
      where.push('(i.name LIKE ? OR i.class_name LIKE ?)');
      const t = `%${filters.search}%`;
      params.push(t, t);
    }

    const w = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const baseSql = `SELECT i.*, m.name as manufacturer_name FROM items i LEFT JOIN manufacturers m ON i.manufacturer_code = m.code${w}`;
    const countSql = `SELECT COUNT(*) as total FROM items i${w}`;

    return paginate(this.prisma, baseSql, countSql, params, filters || {}, ITEM_SORT, 'i');
  }

  async getItemByUuid(uuid: string, env = 'live'): Promise<Row | null> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      'SELECT i.*, m.name as manufacturer_name FROM items i LEFT JOIN manufacturers m ON i.manufacturer_code = m.code WHERE i.uuid = ? AND i.game_env = ?',
      uuid,
      env,
    );
    return rows[0] || null;
  }

  async getItemByClassName(className: string, env = 'live'): Promise<Row | null> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      'SELECT i.*, m.name as manufacturer_name FROM items i LEFT JOIN manufacturers m ON i.manufacturer_code = m.code WHERE i.class_name = ? AND i.game_env = ?',
      className,
      env,
    );
    return rows[0] || null;
  }

  async resolveItem(id: string, env = 'live'): Promise<Row | null> {
    return id.length === 36 ? this.getItemByUuid(id, env) : this.getItemByClassName(id, env);
  }

  async getItemFilters(): Promise<{ types: string[]; sub_types: string[]; manufacturers: string[] }> {
    const [typeRows, subTypeRows, mfrRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<Row[]>('SELECT DISTINCT type FROM items WHERE type IS NOT NULL ORDER BY type'),
      this.prisma.$queryRawUnsafe<Row[]>(
        "SELECT DISTINCT sub_type FROM items WHERE sub_type IS NOT NULL AND sub_type != '' ORDER BY sub_type",
      ),
      this.prisma.$queryRawUnsafe<Row[]>(
        'SELECT DISTINCT manufacturer_code FROM items WHERE manufacturer_code IS NOT NULL ORDER BY manufacturer_code',
      ),
    ]);
    return {
      types: typeRows.map((r) => String(r.type)),
      sub_types: subTypeRows.map((r) => String(r.sub_type)),
      manufacturers: mfrRows.map((r) => String(r.manufacturer_code)),
    };
  }

  async getItemTypes(): Promise<{ types: { type: string; count: number }[] }> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>('SELECT type, COUNT(*) as count FROM items GROUP BY type ORDER BY count DESC');
    return { types: rows.map((r) => ({ type: String(r.type), count: Number(r.count) })) };
  }

  async getItemBuyLocations(uuid: string): Promise<Row[]> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT s.id as shop_id, s.name as shop_name, s.location, s.planet_moon,
              s.\`system\` as system_name, s.city, s.shop_type,
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
