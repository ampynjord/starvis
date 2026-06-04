/**
 * ComponentQueryService — Component listing, filters, buy locations, ships
 */
import type { PrismaLike as PrismaClient } from '@starvis/db';
import { type FiltersResult, type PaginatedResult, paginate, type Row, stripInternal, toPostgres } from './shared.js';

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
  'radar_ping_range',
  'fuel_capacity',
  'shield_downed_regen_delay',
  'gimbal_max_angle',
  'missile_damage',
  'missile_explosion_radius',
  'weapon_beam_dps',
  'weapon_heat_per_shot',
  'qd_calibration_rate',
  'turret_max_pitch',
  'turret_max_yaw',
]);

export class ComponentQueryService {
  constructor(private getClient: (env: string) => PrismaClient) {}

  async getAllComponents(filters?: {
    env?: string;
    type?: string;
    /** Multiple types (from category mapping) — overrides `type` when provided */
    types?: string[];
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
    const prisma = this.getClient(env);
    const where: string[] = ['c.env = ?'];
    const params: (string | number)[] = [env];

    if (filters?.types && filters.types.length > 0) {
      // Multi-type filter for category-based queries
      const placeholders = filters.types.map(() => '?').join(', ');
      where.push(`c.type IN (${placeholders})`);
      params.push(...filters.types);
    } else if (filters?.type) {
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
      where.push('(c.name ILIKE ? OR c.class_name ILIKE ?)');
      const t = `%${filters.search}%`;
      params.push(t, t);
    }

    const w = ` WHERE ${where.join(' AND ')}`;
    const baseSql = `SELECT c.*, m.name as manufacturer_name FROM game.components c LEFT JOIN game.manufacturers m ON c.manufacturer_code = m.code${w}`;
    const countSql = `SELECT COUNT(*) as total FROM game.components c${w}`;

    return paginate(prisma, baseSql, countSql, params, filters || {}, COMP_SORT, 'c');
  }

  async getComponentByUuid(uuid: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(
        'SELECT c.*, m.name as manufacturer_name FROM game.components c LEFT JOIN game.manufacturers m ON c.manufacturer_code = m.code WHERE c.uuid = ? AND c.env = ?',
      ),
      uuid,
      env,
    );
    return rows[0] ? stripInternal(rows[0]) : null;
  }

  async getComponentByClassName(className: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(
        'SELECT c.*, m.name as manufacturer_name FROM game.components c LEFT JOIN game.manufacturers m ON c.manufacturer_code = m.code WHERE c.class_name = ? AND c.env = ?',
      ),
      className,
      env,
    );
    return rows[0] ? stripInternal(rows[0]) : null;
  }

  async resolveComponent(id: string, env = 'live'): Promise<Row | null> {
    return id.length === 36 ? await this.getComponentByUuid(id, env) : await this.getComponentByClassName(id, env);
  }

  async getComponentFilters(env = 'live'): Promise<FiltersResult> {
    const prisma = this.getClient(env);
    const [typeRows, subTypeRows, sizeRows, gradeRows, mfrRows] = await Promise.all([
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(
          "SELECT type as value, COUNT(*) as count FROM game.components WHERE env = ? AND type IS NOT NULL AND type != '' GROUP BY type ORDER BY type",
        ),
        env,
      ),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(
          "SELECT sub_type as value, COUNT(*) as count FROM game.components WHERE env = ? AND sub_type IS NOT NULL AND sub_type != '' GROUP BY sub_type ORDER BY sub_type",
        ),
        env,
      ),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres('SELECT DISTINCT size as value FROM game.components WHERE env = ? AND size IS NOT NULL ORDER BY size'),
        env,
      ),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(
          "SELECT DISTINCT grade as value FROM game.components WHERE env = ? AND grade IS NOT NULL AND grade != '' ORDER BY grade",
        ),
        env,
      ),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(
          "SELECT c.manufacturer_code as value, COALESCE(m.name, c.manufacturer_code) as label, COUNT(c.uuid) as count FROM game.components c LEFT JOIN game.manufacturers m ON m.code = c.manufacturer_code WHERE c.env = ? AND c.manufacturer_code IS NOT NULL AND c.manufacturer_code != '' GROUP BY c.manufacturer_code, m.name ORDER BY label",
        ),
        env,
      ),
    ]);
    return {
      filters: {
        type: typeRows.map((r) => ({ value: String(r.value), label: String(r.value), count: Number(r.count) })),
        sub_type: subTypeRows.map((r) => ({ value: String(r.value), label: String(r.value), count: Number(r.count) })),
        size: sizeRows.map((r) => ({ value: String(r.value), label: `S${r.value}` })),
        grade: gradeRows.map((r) => ({ value: String(r.value), label: String(r.value) })),
        manufacturer: mfrRows.map((r) => ({ value: String(r.value), label: String(r.label), count: Number(r.count) })),
      },
    };
  }

  async getComponentBuyLocations(uuid: string, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT s.name as shop_name, s.location, s.planet_moon, s.shop_type,
              s.canonical_shop_key, s.canonical_location_key,
              si.base_price, si.rental_price_1d, si.rental_price_3d, si.rental_price_7d, si.rental_price_30d
       FROM game.shop_inventory si JOIN game.shops s ON si.shop_id = s.id
       WHERE s.env = ? AND si.component_uuid = ? ORDER BY si.base_price`),
      env,
      uuid,
    );
    return rows;
  }

  async getComponentShips(uuid: string, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT DISTINCT s.uuid, s.name, s.class_name, s.manufacturer_code, m.name as manufacturer_name
       FROM game.ship_loadouts sl
       JOIN game.ships s ON sl.ship_uuid = s.uuid AND s.env = ?
       LEFT JOIN game.manufacturers m ON s.manufacturer_code = m.code
       WHERE sl.env = ? AND sl.component_uuid = ? ORDER BY s.name`),
      env,
      env,
      uuid,
    );
    return rows;
  }

  async getComponentTypes(env = 'live'): Promise<{ types: { type: string; count: number }[] }> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres('SELECT type, COUNT(*) as count FROM game.components WHERE env = ? GROUP BY type ORDER BY count DESC'),
      env,
    );
    return { types: rows.map((r) => ({ type: String(r.type), count: Number(r.count) })) };
  }

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
    const prisma = this.getClient(env);
    const where: string[] = ['c.env = ?'];
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
      where.push('(c.name ILIKE ? OR c.class_name ILIKE ?)');
      params.push(`%${opts.search}%`, `%${opts.search}%`);
    }

    const sortCol = COMP_SORT.has(opts.sort ?? '') ? opts.sort! : 'size';
    const order = opts.order === 'desc' ? 'DESC' : 'ASC';
    const limit = Math.min(200, Math.max(1, opts.limit ?? 100));
    const wSql = `WHERE ${where.join(' AND ')}`;

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
      FROM game.components c
      LEFT JOIN game.manufacturers m ON c.manufacturer_code = m.code
      ${wSql}
      ORDER BY c.${sortCol} ${order}
      LIMIT ${limit}`;

    const rows = await prisma.$queryRawUnsafe<Row[]>(toPostgres(sql), ...params);
    return rows;
  }
}
