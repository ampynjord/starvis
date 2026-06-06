/**
 * ComponentQueryService — Component listing, filters, buy locations, ships
 */
import type { PrismaLike as PrismaClient } from '@starvis/db';
import { getGameComponentCategory } from './component-taxonomy.js';
import { type FiltersResult, type PaginatedResult, paginate, type Row, stripInternal, toPostgres } from './shared.js';

const COMP_SORT = new Set([
  'name',
  'class_name',
  'type',
  'size',
  'grade',
  'component_class',
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

const COMPONENT_CLASS_EXPR = `COALESCE(NULLIF(c.component_class, ''), CASE
  WHEN c.class_name ~* 'stealth|_ste_|_ghost|eclipse|raven|razor_ex' OR c.name ~* 'stealth' THEN 'Stealth'
  WHEN c.class_name ~* 'competition|_comp_|racing|_rac_|razor|m50|350r' OR c.name ~* 'competition|racing' THEN 'Competition'
  WHEN c.class_name ~* 'military|_mil_|_navy|hornet|gladius|sabre|vanguard|redeemer|hammerhead|idris|javelin' OR c.name ~* 'military' THEN 'Military'
  WHEN c.class_name ~* 'industrial|_ind_|mining|mininglaser|salvage|tractor|reclaimer|prospector|mole|vulture|srv|argo' OR c.name ~* 'industrial|mining|salvage|tractor' THEN 'Industrial'
  WHEN c.class_name ~* 'civilian|_civ_|aurora|mustang|nomad|freelancer|constellation|cutlass|caterpillar|starfarer|600i|890' OR c.name ~* 'civilian' THEN 'Civilian'
  ELSE NULL
END)`;

const COMPONENT_GRADE_EXPR = `CASE
  WHEN c.grade = 'A' THEN 'A'
  WHEN c.grade = 'B' THEN 'B'
  WHEN c.grade = 'C' THEN 'C'
  WHEN c.grade IS NOT NULL AND c.grade != '' THEN 'D'
  ELSE NULL
END`;

const COMPONENT_SUB_TYPE_EXPR = `CASE
  WHEN c.type IN ('Missile', 'WeaponMissile', 'Rocket') AND (c.class_name ~* 'rocket' OR c.name ~* 'rocket') THEN 'Rocket'
  WHEN c.type IN ('Missile', 'WeaponMissile', 'Torpedo') AND (c.class_name ~* 'torpedo' OR c.name ~* 'torpedo') THEN 'Torpedo'
  WHEN c.type IN ('Missile', 'WeaponMissile', 'Bomb') AND (c.class_name ~* 'bomb' OR c.name ~* 'bomb') THEN 'Bomb'
  WHEN c.type IN ('MissileRack', 'RocketPod') AND (c.class_name ~* 'rocket' OR c.name ~* 'rocket') THEN 'Rocket'
  WHEN c.type IN ('MissileRack', 'TorpedoRack') AND (c.class_name ~* 'torpedo' OR c.name ~* 'torpedo') THEN 'Torpedo'
  WHEN c.type IN ('MissileRack', 'BombRack') AND (c.class_name ~* 'bomb' OR c.name ~* 'bomb') THEN 'Bomb'
  ELSE c.sub_type
END`;

const COMPONENT_DAMAGE_TYPE_EXPR = `CASE
  WHEN c.class_name ~* 'tachyon' OR c.name ~* 'tachyon' THEN 'Tachyon'
  WHEN c.class_name ~* 'plasma' OR c.name ~* 'plasma' OR LOWER(c.weapon_damage_type) = 'thermal' THEN 'Plasma'
  WHEN LOWER(c.weapon_damage_type) = 'physical' THEN 'Ballistic'
  WHEN LOWER(c.weapon_damage_type) = 'energy' THEN 'Laser'
  WHEN LOWER(c.weapon_damage_type) = 'distortion' THEN 'Distortion'
  ELSE c.weapon_damage_type
END`;

const COMPONENT_VISIBLE_WHERE = `NOT (
  c.class_name ~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
  OR c.name ~* '(^temp\\s|\\stemp\\s|temporary|template|placeholder)'
)`;

const IS_BESPOKE_EXPR = `(EXISTS (
  SELECT 1 FROM game.ship_loadouts sl
  WHERE sl.env = c.env AND sl.component_uuid = c.uuid
) AND NOT EXISTS (
  SELECT 1 FROM game.shop_inventory si
  WHERE si.component_uuid = c.uuid
))`;

function withGameComponentCategory<T extends Row>(row: T): T {
  return { ...row, game_component_category: getGameComponentCategory(String(row.type || '')) };
}

function isPaintQuery(filters: { type?: string; types?: string[] | string } | undefined, types: string[]): boolean {
  const requested = new Set(types.map((type) => type.toLowerCase()));
  if (filters?.type) requested.add(filters.type.toLowerCase());
  return requested.has('paint') || requested.has('livery');
}

export class ComponentQueryService {
  constructor(private getClient: (env: string) => PrismaClient) {}

  async getAllComponents(filters?: {
    env?: string;
    type?: string;
    /** Multiple types (from category mapping) — overrides `type` when provided */
    types?: string[] | string;
    sub_type?: string;
    sub_types?: string[] | string;
    weapon_damage_type?: string;
    cm_type?: string;
    size?: string;
    grade?: string;
    component_class?: string;
    is_bespoke?: string;
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
    const where: string[] = ['c.env = ?', COMPONENT_VISIBLE_WHERE];
    const params: (string | number)[] = [env];

    const rawTypes = Array.isArray(filters?.types) ? filters.types : typeof filters?.types === 'string' ? filters.types.split(',') : [];
    const types = rawTypes.map((type) => String(type).trim()).filter(Boolean);
    if (isPaintQuery(filters, types)) {
      return this.getAllPaintComponents(filters);
    }
    if (types.length > 0) {
      // Multi-type filter for category-based queries
      const placeholders = types.map(() => '?').join(', ');
      where.push(`c.type IN (${placeholders})`);
      params.push(...types);
    } else if (filters?.type) {
      where.push('c.type = ?');
      params.push(filters.type);
    }
    const rawSubTypes = Array.isArray(filters?.sub_types)
      ? filters.sub_types
      : typeof filters?.sub_types === 'string'
        ? filters.sub_types.split(',')
        : [];
    const subTypes = rawSubTypes.map((subType) => String(subType).trim()).filter(Boolean);
    if (subTypes.length > 0) {
      const placeholders = subTypes.map(() => '?').join(', ');
      where.push(`${COMPONENT_SUB_TYPE_EXPR} IN (${placeholders})`);
      params.push(...subTypes);
    } else if (filters?.sub_type) {
      where.push(`${COMPONENT_SUB_TYPE_EXPR} = ?`);
      params.push(filters.sub_type);
    }
    if (filters?.weapon_damage_type) {
      const damageType = filters.weapon_damage_type.toLowerCase();
      const aliases: Record<string, string[]> = {
        ballistic: ['ballistic', 'physical'],
        laser: ['laser', 'energy'],
        distortion: ['distortion'],
        plasma: ['plasma', 'thermal'],
        tachyon: ['tachyon'],
      };
      const values = aliases[damageType] ?? [filters.weapon_damage_type];
      const placeholders = values.map(() => '?').join(', ');
      where.push(`LOWER(${COMPONENT_DAMAGE_TYPE_EXPR}) IN (${placeholders})`);
      params.push(...values);
    }
    if (filters?.cm_type) {
      where.push('LOWER(c.cm_type) LIKE ?');
      params.push(`${filters.cm_type.toLowerCase()}%`);
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
      where.push(`${COMPONENT_GRADE_EXPR} = ?::text`);
      params.push(filters.grade);
    }
    if (filters?.component_class) {
      where.push(`${COMPONENT_CLASS_EXPR} = ?::text`);
      params.push(filters.component_class);
    }
    if (filters?.is_bespoke != null) {
      const wantsBespoke = ['1', 'true', 'yes'].includes(String(filters.is_bespoke).toLowerCase());
      where.push(`${IS_BESPOKE_EXPR} = ${wantsBespoke ? 'TRUE' : 'FALSE'}`);
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
    const baseSql = `SELECT c.*, ${COMPONENT_SUB_TYPE_EXPR} as sub_type, ${COMPONENT_GRADE_EXPR} as grade, ${COMPONENT_DAMAGE_TYPE_EXPR} as weapon_damage_type, ${COMPONENT_CLASS_EXPR} as component_class, ${IS_BESPOKE_EXPR} as is_bespoke, m.name as manufacturer_name FROM game.components c LEFT JOIN game.manufacturers m ON c.manufacturer_code = m.code${w}`;
    const countSql = `SELECT COUNT(*) as total FROM game.components c${w}`;

    const result = await paginate(prisma, baseSql, countSql, params, filters || {}, COMP_SORT, 'c');
    return { ...result, data: result.data.map(withGameComponentCategory) };
  }

  private async getAllPaintComponents(filters?: {
    env?: string;
    search?: string;
    manufacturer?: string;
    is_bespoke?: string;
    sort?: string;
    order?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult> {
    const env = filters?.env ?? 'live';
    const prisma = this.getClient(env);
    const where: string[] = ['sp.env = ?'];
    const params: (string | number)[] = [env];

    if (filters?.search) {
      where.push('(sp.paint_name ILIKE ? OR sp.paint_class_name ILIKE ? OR s.name ILIKE ?)');
      const t = `%${filters.search}%`;
      params.push(t, t, t);
    }
    if (filters?.manufacturer) {
      where.push('s.manufacturer_code = ?');
      params.push(filters.manufacturer.toUpperCase());
    }
    if (filters?.is_bespoke != null) {
      const wantsBespoke = ['1', 'true', 'yes'].includes(String(filters.is_bespoke).toLowerCase());
      if (!wantsBespoke) where.push('FALSE');
    }

    const w = ` WHERE ${where.join(' AND ')}`;
    const order = filters?.order === 'desc' ? 'DESC' : 'ASC';
    const sortMap: Record<string, string> = {
      name: 'name',
      class_name: 'class_name',
      manufacturer_code: 'manufacturer_code',
    };
    const sort = sortMap[filters?.sort ?? ''] ?? 'name';
    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(5000, Math.max(1, filters?.limit || 50));
    const offset = (page - 1) * limit;

    const countRows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(
        `SELECT COUNT(*) as total FROM game.ship_paints sp LEFT JOIN game.ships s ON sp.ship_uuid = s.uuid AND s.env = sp.env${w}`,
      ),
      ...params,
    );
    const total = Number(countRows[0]?.total) || 0;
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT
        COALESCE(sp.paint_uuid, 'paint-' || sp.id::text) as uuid,
        sp.env,
        sp.paint_class_name as class_name,
        COALESCE(sp.paint_name, sp.paint_class_name) as name,
        'Paint' as type,
        'Livery' as sub_type,
        NULL::integer as size,
        NULL::text as grade,
        NULL::text as component_class,
        TRUE as is_bespoke,
        s.manufacturer_code,
        m.name as manufacturer_name,
        sp.ship_uuid,
        s.name as ship_name,
        sp.paint_uuid,
        sp.id as paint_id
       FROM game.ship_paints sp
       LEFT JOIN game.ships s ON sp.ship_uuid = s.uuid AND s.env = sp.env
       LEFT JOIN game.manufacturers m ON s.manufacturer_code = m.code${w}
       ORDER BY ${sort} ${order}
       LIMIT ${limit} OFFSET ${offset}`),
      ...params,
    );
    return {
      data: rows.map(withGameComponentCategory),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async getComponentByUuid(uuid: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(
        `SELECT c.*, ${COMPONENT_SUB_TYPE_EXPR} as sub_type, ${COMPONENT_GRADE_EXPR} as grade, ${COMPONENT_DAMAGE_TYPE_EXPR} as weapon_damage_type, ${COMPONENT_CLASS_EXPR} as component_class, ${IS_BESPOKE_EXPR} as is_bespoke, m.name as manufacturer_name FROM game.components c LEFT JOIN game.manufacturers m ON c.manufacturer_code = m.code WHERE c.uuid = ? AND c.env = ?`,
      ),
      uuid,
      env,
    );
    return rows[0] ? withGameComponentCategory(stripInternal(rows[0])) : null;
  }

  async getComponentByClassName(className: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(
        `SELECT c.*, ${COMPONENT_SUB_TYPE_EXPR} as sub_type, ${COMPONENT_GRADE_EXPR} as grade, ${COMPONENT_DAMAGE_TYPE_EXPR} as weapon_damage_type, ${COMPONENT_CLASS_EXPR} as component_class, ${IS_BESPOKE_EXPR} as is_bespoke, m.name as manufacturer_name FROM game.components c LEFT JOIN game.manufacturers m ON c.manufacturer_code = m.code WHERE c.class_name = ? AND c.env = ?`,
      ),
      className,
      env,
    );
    return rows[0] ? withGameComponentCategory(stripInternal(rows[0])) : null;
  }

  async resolveComponent(id: string, env = 'live'): Promise<Row | null> {
    return id.length === 36 ? await this.getComponentByUuid(id, env) : await this.getComponentByClassName(id, env);
  }

  async getComponentFilters(env = 'live'): Promise<FiltersResult> {
    const prisma = this.getClient(env);
    const [typeRows, subTypeRows, sizeRows, gradeRows, classRows, bespokeRows, mfrRows] = await Promise.all([
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(
          `SELECT type as value, COUNT(*) as count FROM game.components c WHERE c.env = ? AND ${COMPONENT_VISIBLE_WHERE} AND type IS NOT NULL AND type != '' GROUP BY type ORDER BY type`,
        ),
        env,
      ),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(
          `SELECT ${COMPONENT_SUB_TYPE_EXPR} as value, COUNT(*) as count FROM game.components c WHERE c.env = ? AND ${COMPONENT_VISIBLE_WHERE} AND ${COMPONENT_SUB_TYPE_EXPR} IS NOT NULL AND ${COMPONENT_SUB_TYPE_EXPR} != '' GROUP BY value ORDER BY value`,
        ),
        env,
      ),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(
          `SELECT DISTINCT size as value FROM game.components c WHERE c.env = ? AND ${COMPONENT_VISIBLE_WHERE} AND size IS NOT NULL ORDER BY size`,
        ),
        env,
      ),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(
          `SELECT g.grade as value, COUNT(c.uuid) as count
           FROM (VALUES ('A'), ('B'), ('C'), ('D')) AS g(grade)
           LEFT JOIN game.components c ON c.env = ? AND ${COMPONENT_VISIBLE_WHERE} AND ${COMPONENT_GRADE_EXPR} = g.grade
           GROUP BY g.grade
           ORDER BY g.grade`,
        ),
        env,
      ),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(
          `SELECT ${COMPONENT_CLASS_EXPR} as value, COUNT(*) as count FROM game.components c WHERE c.env = ? AND ${COMPONENT_VISIBLE_WHERE} AND ${COMPONENT_CLASS_EXPR} IS NOT NULL GROUP BY value ORDER BY value`,
        ),
        env,
      ),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(
          `SELECT ${IS_BESPOKE_EXPR} as value, COUNT(*) as count FROM game.components c WHERE c.env = ? AND ${COMPONENT_VISIBLE_WHERE} GROUP BY value ORDER BY value`,
        ),
        env,
      ),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(
          `SELECT c.manufacturer_code as value, COALESCE(m.name, c.manufacturer_code) as label, COUNT(c.uuid) as count FROM game.components c LEFT JOIN game.manufacturers m ON m.code = c.manufacturer_code WHERE c.env = ? AND ${COMPONENT_VISIBLE_WHERE} AND c.manufacturer_code IS NOT NULL AND c.manufacturer_code != '' GROUP BY c.manufacturer_code, m.name ORDER BY label`,
        ),
        env,
      ),
    ]);
    return {
      filters: {
        type: typeRows.map((r) => ({ value: String(r.value), label: String(r.value), count: Number(r.count) })),
        sub_type: subTypeRows.map((r) => ({ value: String(r.value), label: String(r.value), count: Number(r.count) })),
        game_component_category: Object.entries(
          typeRows.reduce<Record<string, number>>((acc, r) => {
            const category = getGameComponentCategory(String(r.value));
            acc[category] = (acc[category] ?? 0) + Number(r.count);
            return acc;
          }, {}),
        ).map(([value, count]) => ({ value, label: value, count })),
        size: sizeRows.map((r) => ({ value: String(r.value), label: `S${r.value}` })),
        grade: gradeRows.map((r) => ({ value: String(r.value), label: String(r.value), count: Number(r.count) })),
        component_class: classRows.map((r) => ({ value: String(r.value), label: String(r.value), count: Number(r.count) })),
        is_bespoke: bespokeRows.map((r) => ({
          value: String(r.value === true || r.value === 't'),
          label: r.value === true || r.value === 't' ? 'Bespoke' : 'Universal',
          count: Number(r.count),
        })),
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
    const where: string[] = ['c.env = ?', COMPONENT_VISIBLE_WHERE];
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
      SELECT c.uuid, c.class_name, c.name, c.type, ${COMPONENT_SUB_TYPE_EXPR} as sub_type, c.size, ${COMPONENT_GRADE_EXPR} as grade,
             ${COMPONENT_CLASS_EXPR} as component_class, ${IS_BESPOKE_EXPR} as is_bespoke,
             c.manufacturer_code, m.name as manufacturer_name,
             ${COMPONENT_DAMAGE_TYPE_EXPR} as weapon_damage_type,
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
    return rows.map(withGameComponentCategory);
  }
}
