/**
 * ComponentQueryService — Component listing, filters, buy locations, ships
 */
import type { PrismaClient } from '@prisma/client';
import { type PaginatedResult, paginate, type Row } from './shared.js';

const COMP_SORT = new Set([
  'name',
  'class_name',
  'type',
  'size',
  'grade',
  'manufacturer_code',
  'weapon_dps',
  'weapon_burst_dps',
  'weapon_sustained_dps',
  'weapon_damage',
  'weapon_fire_rate',
  'weapon_range',
  'weapon_damage_physical',
  'weapon_damage_energy',
  'weapon_damage_distortion',
  'shield_hp',
  'shield_regen',
  'qd_speed',
  'qd_spool_time',
  'power_output',
  'cooling_rate',
  'hp',
  'mass',
  'thruster_max_thrust',
  'radar_range',
  'fuel_capacity',
]);

export class ComponentQueryService {
  constructor(private prisma: PrismaClient) {}

  async getAllComponents(filters?: {
    env?: string;
    type?: string;
    sub_type?: string;
    size?: string;
    grade?: string;
    min_size?: string;
    max_size?: string;
    manufacturer?: string;
    search?: string;
    sort?: string;
    order?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult> {
    const env = filters?.env ?? 'live';
    const where: string[] = ['c.game_env = ?'];
    const params: (string | number)[] = [env];

    if (filters?.type) {
      where.push('c.type = ?');
      params.push(filters.type);
    }
    if (filters?.sub_type) {
      where.push('c.sub_type = ?');
      params.push(filters.sub_type);
    }
    if (filters?.size) {
      where.push('c.size = ?');
      params.push(parseInt(filters.size, 10));
    }
    if (filters?.min_size) {
      where.push('c.size >= ?');
      params.push(parseInt(filters.min_size, 10));
    }
    if (filters?.max_size) {
      where.push('c.size <= ?');
      params.push(parseInt(filters.max_size, 10));
    }
    if (filters?.grade) {
      where.push('c.grade = ?');
      params.push(filters.grade);
    }
    if (filters?.manufacturer) {
      where.push('c.manufacturer_code = ?');
      params.push(filters.manufacturer.toUpperCase());
    }
    if (filters?.search) {
      where.push('(c.name LIKE ? OR c.class_name LIKE ?)');
      const t = `%${filters.search}%`;
      params.push(t, t);
    }

    const w = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const baseSql = `SELECT c.*, m.name as manufacturer_name FROM components c LEFT JOIN manufacturers m ON c.manufacturer_code = m.code${w}`;
    const countSql = `SELECT COUNT(*) as total FROM components c${w}`;

    return paginate(this.prisma, baseSql, countSql, params, filters || {}, COMP_SORT, 'c');
  }

  async getComponentByUuid(uuid: string, env = 'live'): Promise<Row | null> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      'SELECT c.*, m.name as manufacturer_name FROM components c LEFT JOIN manufacturers m ON c.manufacturer_code = m.code WHERE c.uuid = ? AND c.game_env = ?',
      uuid,
      env,
    );
    return rows[0] || null;
  }

  async getComponentByClassName(className: string, env = 'live'): Promise<Row | null> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      'SELECT c.*, m.name as manufacturer_name FROM components c LEFT JOIN manufacturers m ON c.manufacturer_code = m.code WHERE c.class_name = ? AND c.game_env = ?',
      className,
      env,
    );
    return rows[0] || null;
  }

  /** Resolve UUID or class_name → component */
  async resolveComponent(id: string, env = 'live'): Promise<Row | null> {
    return id.length === 36 ? await this.getComponentByUuid(id, env) : await this.getComponentByClassName(id, env);
  }

  async getComponentFilters(env = 'live'): Promise<{
    types: string[];
    sub_types: string[];
    sizes: number[];
    grades: string[];
    manufacturers: string[];
  }> {
    const [typeRows, subTypeRows, sizeRows, gradeRows, mfrRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<Row[]>(
        "SELECT DISTINCT type FROM components WHERE type IS NOT NULL AND type != '' AND game_env = ? ORDER BY type",
        env,
      ),
      this.prisma.$queryRawUnsafe<Row[]>(
        "SELECT DISTINCT sub_type FROM components WHERE sub_type IS NOT NULL AND sub_type != '' AND game_env = ? ORDER BY sub_type",
        env,
      ),
      this.prisma.$queryRawUnsafe<Row[]>('SELECT DISTINCT size FROM components WHERE game_env = ? ORDER BY size', env),
      this.prisma.$queryRawUnsafe<Row[]>(
        "SELECT DISTINCT grade FROM components WHERE grade IS NOT NULL AND grade != '' AND game_env = ? ORDER BY grade",
        env,
      ),
      this.prisma.$queryRawUnsafe<Row[]>(
        "SELECT DISTINCT manufacturer_code FROM components WHERE manufacturer_code IS NOT NULL AND manufacturer_code != '' AND game_env = ? ORDER BY manufacturer_code",
        env,
      ),
    ]);
    return {
      types: typeRows.map((r) => String(r.type)),
      sub_types: subTypeRows.map((r) => String(r.sub_type)),
      sizes: sizeRows.map((r) => Number(r.size)),
      grades: gradeRows.map((r) => String(r.grade)),
      manufacturers: mfrRows.map((r) => String(r.manufacturer_code)),
    };
  }

  async getComponentBuyLocations(uuid: string, env = 'live'): Promise<Row[]> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT s.name as shop_name, s.location, s.planet_moon, s.shop_type,
              s.source_type as shop_source_type, s.source_name as shop_source_name,
              s.canonical_shop_key, s.canonical_location_key,
              si.source_type as inventory_source_type, si.source_name as inventory_source_name,
              si.confidence_score,
              si.base_price, si.rental_price_1d, si.rental_price_3d, si.rental_price_7d, si.rental_price_30d
       FROM shop_inventory si JOIN shops s ON si.shop_id = s.id
       WHERE si.component_uuid = ? AND si.game_env = ? ORDER BY si.base_price`,
      uuid,
      env,
    );
    return rows;
  }

  async getComponentShips(uuid: string, env = 'live'): Promise<Row[]> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT DISTINCT s.uuid, s.name, s.class_name, s.manufacturer_code, m.name as manufacturer_name
       FROM ships_loadouts sl
       JOIN ships s ON sl.ship_uuid = s.uuid AND sl.game_env = s.game_env
       LEFT JOIN manufacturers m ON s.manufacturer_code = m.code
       WHERE sl.component_uuid = ? AND sl.game_env = ? ORDER BY s.name`,
      uuid,
      env,
    );
    return rows;
  }

  async getComponentTypes(env = 'live'): Promise<{ types: { type: string; count: number }[] }> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      'SELECT type, COUNT(*) as count FROM components WHERE game_env = ? GROUP BY type ORDER BY count DESC',
      env,
    );
    return { types: rows.map((r) => ({ type: String(r.type), count: Number(r.count) })) };
  }

  /**
   * Returns components compatible with a given loadout port.
   * Used by the Ship Outfitter to populate the component picker.
   */
  async getCompatibleComponents(opts: {
    env?: string;
    type?: string;
    min_size?: number;
    max_size?: number;
    search?: string;
    sort?: string;
    order?: string;
    limit?: number;
  }): Promise<Row[]> {
    const env = opts.env ?? 'live';
    const where: string[] = ['c.game_env = ?'];
    const params: (string | number)[] = [env];

    if (opts.type) {
      where.push('c.type = ?');
      params.push(opts.type);
    }
    if (opts.min_size != null) {
      where.push('c.size >= ?');
      params.push(opts.min_size);
    }
    if (opts.max_size != null) {
      where.push('c.size <= ?');
      params.push(opts.max_size);
    }
    if (opts.search) {
      where.push('(c.name LIKE ? OR c.class_name LIKE ?)');
      params.push(`%${opts.search}%`, `%${opts.search}%`);
    }

    const sortCol = COMP_SORT.has(opts.sort ?? '') ? opts.sort! : 'size';
    const order = opts.order === 'desc' ? 'DESC' : 'ASC';
    const limit = Math.min(200, Math.max(1, opts.limit ?? 100));
    const wSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const sql = `
      SELECT c.uuid, c.class_name, c.name, c.type, c.sub_type, c.size, c.grade,
             c.manufacturer_code, m.name as manufacturer_name,
             c.weapon_dps, c.weapon_burst_dps, c.weapon_sustained_dps,
             c.weapon_damage, c.weapon_fire_rate, c.weapon_range,
             c.weapon_damage_energy, c.weapon_damage_physical, c.weapon_damage_distortion,
             c.shield_hp, c.shield_regen, c.shield_regen_delay, c.shield_hardening,
             c.qd_speed, c.qd_spool_time, c.qd_fuel_rate, c.qd_range,
             c.power_output, c.power_draw, c.cooling_rate,
             c.heat_generation, c.em_signature, c.ir_signature,
             c.thruster_max_thrust, c.radar_range, c.fuel_capacity,
             c.cm_ammo_count, c.missile_damage, c.mass, c.hp
      FROM components c
      LEFT JOIN manufacturers m ON c.manufacturer_code = m.code
      ${wSql}
      ORDER BY c.${sortCol} ${order}
      LIMIT ${limit}`;

    const rows = await this.prisma.$queryRawUnsafe<Row[]>(sql, ...params);
    return rows;
  }
}
