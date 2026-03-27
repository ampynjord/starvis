/**
 * ShipQueryService — Ship listing, search, filters, manufacturers
 */
import type { PrismaClient } from '@prisma/client';
import { convertBigIntToNumber, num, type PaginatedResult, type Row } from './shared.js';

// prettier-ignore
const SHIP_SELECT = [
  // Identity
  's.uuid',
  's.class_name',
  'COALESCE(sm.name, s.name) as name',
  's.manufacturer_code',
  'm.name as manufacturer_name',
  // Role & career
  's.career',
  's.role',
  // Physical
  's.mass',
  's.total_hp',
  's.size_x',
  's.size_y',
  's.size_z',
  // Flight
  's.scm_speed',
  's.max_speed',
  's.boost_speed_forward',
  's.boost_speed_backward',
  's.pitch_max',
  's.yaw_max',
  's.roll_max',
  's.boost_ramp_up',
  's.boost_ramp_down',
  // Resources
  's.hydrogen_fuel_capacity',
  's.quantum_fuel_capacity',
  's.cargo_capacity',
  's.crew_size',
  's.shield_hp',
  // Combat
  's.missile_damage_total',
  's.weapon_damage_total',
  // Armor & signals
  's.armor_physical',
  's.armor_energy',
  's.armor_distortion',
  's.armor_hp',
  's.armor_phys_resist',
  's.armor_energy_resist',
  's.armor_signal_ir',
  's.armor_signal_em',
  's.armor_signal_cs',
  's.fuse_penetration',
  's.component_penetration',
  // Cross sections
  's.cross_section_x',
  's.cross_section_y',
  's.cross_section_z',
  // Ship Matrix / media
  's.ship_matrix_id',
  'sm.media_store_small as thumbnail',
  'sm.media_store_large as thumbnail_large',
  'sm.production_status',
  'sm.description as sm_description',
  'sm.url as store_url',
  'sm.cargocapacity as sm_cargo',
  'sm.min_crew',
  'sm.max_crew',
  // Meta
  's.vehicle_category',
  's.insurance_claim_time',
  's.insurance_expedite_cost',
  's.short_name',
  's.variant_type',
].join(', ');

// prettier-ignore
const CONCEPT_SELECT = [
  // Identity (derived from ship_matrix alias sm2)
  "CONCAT('concept-', sm2.id) as uuid",
  "LOWER(REPLACE(REPLACE(sm2.name, ' ', '_'), '''', '')) as class_name",
  'sm2.name',
  'sm2.manufacturer_code',
  'sm2.manufacturer_name as manufacturer_name',
  // Role & career (no game data)
  'NULL as career',
  'NULL as role',
  // Physical
  'sm2.mass',
  'NULL as total_hp',
  'NULL as size_x',
  'NULL as size_y',
  'NULL as size_z',
  // Flight
  'sm2.scm_speed',
  'sm2.afterburner_speed as max_speed',
  'NULL as boost_speed_forward',
  'NULL as boost_speed_backward',
  'sm2.pitch_max',
  'sm2.yaw_max',
  'sm2.roll_max',
  'NULL as boost_ramp_up',
  'NULL as boost_ramp_down',
  // Resources
  'NULL as hydrogen_fuel_capacity',
  'NULL as quantum_fuel_capacity',
  'sm2.cargocapacity as cargo_capacity',
  'sm2.min_crew as crew_size',
  'NULL as shield_hp',
  // Combat
  'NULL as missile_damage_total',
  'NULL as weapon_damage_total',
  // Armor & signals
  'NULL as armor_physical',
  'NULL as armor_energy',
  'NULL as armor_distortion',
  'NULL as armor_hp',
  'NULL as armor_phys_resist',
  'NULL as armor_energy_resist',
  'NULL as armor_signal_ir',
  'NULL as armor_signal_em',
  'NULL as armor_signal_cs',
  'NULL as fuse_penetration',
  'NULL as component_penetration',
  // Cross sections
  'NULL as cross_section_x',
  'NULL as cross_section_y',
  'NULL as cross_section_z',
  // Ship Matrix / media
  'sm2.id as ship_matrix_id',
  'sm2.media_store_small as thumbnail',
  'sm2.media_store_large as thumbnail_large',
  'sm2.production_status',
  'sm2.description as sm_description',
  'sm2.url as store_url',
  'sm2.cargocapacity as sm_cargo',
  'sm2.min_crew',
  'sm2.max_crew',
  // Meta
  'NULL as vehicle_category',
  'NULL as insurance_claim_time',
  'NULL as insurance_expedite_cost',
  'NULL as short_name',
  'NULL as variant_type',
].join(', ');

const SHIP_JOINS = `FROM ships s
  LEFT JOIN starvis.manufacturers m ON s.manufacturer_code = m.code
  LEFT JOIN starvis.ship_matrix sm ON s.ship_matrix_id = sm.id`;

const SHIP_SORT = new Set([
  'name',
  'class_name',
  'manufacturer_code',
  'mass',
  'scm_speed',
  'max_speed',
  'total_hp',
  'shield_hp',
  'crew_size',
  'cargo_capacity',
  'missile_damage_total',
  'weapon_damage_total',
  'armor_physical',
  'armor_energy',
  'armor_distortion',
  'cross_section_x',
  'cross_section_y',
  'cross_section_z',
  'hydrogen_fuel_capacity',
  'quantum_fuel_capacity',
  'boost_speed_forward',
  'pitch_max',
  'yaw_max',
  'roll_max',
]);

export class ShipQueryService {
  constructor(private getClient: (env: string) => PrismaClient) {}

  async getAllShips(filters?: {
    env?: string;
    manufacturer?: string;
    role?: string;
    career?: string;
    status?: string;
    vehicle_category?: string;
    variant_type?: string;
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

    if (filters?.manufacturer) {
      where.push('s.manufacturer_code = ?');
      params.push(filters.manufacturer.toUpperCase());
    }
    if (filters?.role) {
      where.push('s.role = ?');
      params.push(filters.role);
    }
    if (filters?.career) {
      where.push('s.career = ?');
      params.push(filters.career);
    }
    if (filters?.vehicle_category) {
      where.push('s.vehicle_category = ?');
      params.push(filters.vehicle_category);
    }
    if (filters?.variant_type) {
      if (filters.variant_type === 'none') {
        where.push('s.variant_type IS NULL');
      } else {
        where.push('s.variant_type = ?');
        params.push(filters.variant_type);
      }
    } else {
      where.push("(s.variant_type IS NULL OR s.variant_type NOT IN ('npc', 'tutorial', 'enemy_ai', 'arena_ai', 'competition'))");
    }

    const wantConceptOnly = filters?.status === 'in-concept';
    const wantInGameOnly = filters?.status === 'in-game-only';
    const wantFlightReady = filters?.status === 'flight-ready';
    const excludeConcept = wantInGameOnly || wantFlightReady;

    if (wantFlightReady) {
      where.push('sm.production_status = ?');
      params.push('flight-ready');
    }
    if (wantInGameOnly) {
      where.push('s.ship_matrix_id IS NULL');
    }

    if (filters?.search) {
      where.push('(s.name LIKE ? OR s.class_name LIKE ? OR s.short_name LIKE ? OR sm.name LIKE ?)');
      const t = `%${filters.search}%`;
      params.push(t, t, t, t);
    }

    const w = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const includeConceptShips = !excludeConcept && !filters?.vehicle_category;

    const conceptWhere: string[] = ['sm2.id NOT IN (SELECT ship_matrix_id FROM ships WHERE ship_matrix_id IS NOT NULL)'];
    const conceptParams: (string | number)[] = [];
    if (filters?.manufacturer) {
      conceptWhere.push('sm2.manufacturer_code = ?');
      conceptParams.push(filters.manufacturer.toUpperCase());
    }
    if (filters?.search) {
      conceptWhere.push('(sm2.name LIKE ? OR sm2.manufacturer_name LIKE ?)');
      const t = `%${filters.search}%`;
      conceptParams.push(t, t);
    }
    const cw = ` WHERE ${conceptWhere.join(' AND ')}`;

    let totalCount = 0;
    if (!wantConceptOnly) {
      const countRows = await prisma.$queryRawUnsafe<Row[]>(
        `SELECT COUNT(*) as total FROM ships s LEFT JOIN starvis.ship_matrix sm ON s.ship_matrix_id = sm.id${w}`,
        ...params,
      );
      totalCount += Number(countRows[0]?.total) || 0;
    }
    if (includeConceptShips || wantConceptOnly) {
      const conceptCount = await prisma.$queryRawUnsafe<Row[]>(
        `SELECT COUNT(*) as total FROM starvis.ship_matrix sm2${cw}`,
        ...conceptParams,
      );
      totalCount += Number(conceptCount[0]?.total) || 0;
    }

    const sortCol = SHIP_SORT.has(filters?.sort || '') ? filters!.sort! : 'name';
    const order = filters?.order === 'desc' ? 'DESC' : 'ASC';
    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(200, Math.max(1, filters?.limit || 50));
    const offset = (page - 1) * limit;

    // nullSafeOrder: used for UNION queries (no table alias possible)
    const nullSafeOrder = `${sortCol} IS NULL, ${sortCol} ${order}`;
    // qualifiedOrder: used for single-table queries to avoid ambiguity with joined ship_matrix
    const qualifiedOrder = `s.${sortCol} IS NULL, s.${sortCol} ${order}`;

    let sql: string;
    let allParams: (string | number)[];

    if (wantConceptOnly) {
      sql = `SELECT ${CONCEPT_SELECT}, TRUE as is_concept_only FROM starvis.ship_matrix sm2${cw} ORDER BY ${nullSafeOrder} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
      allParams = [...conceptParams];
    } else if (includeConceptShips) {
      sql = `(SELECT ${SHIP_SELECT}, FALSE as is_concept_only ${SHIP_JOINS}${w}) UNION ALL (SELECT ${CONCEPT_SELECT}, TRUE as is_concept_only FROM starvis.ship_matrix sm2${cw}) ORDER BY ${nullSafeOrder} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
      allParams = [...params, ...conceptParams];
    } else {
      sql = `SELECT ${SHIP_SELECT}, FALSE as is_concept_only ${SHIP_JOINS}${w} ORDER BY ${qualifiedOrder} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
      allParams = [...params];
    }

    const rows = await prisma.$queryRawUnsafe<Row[]>(sql, ...allParams);
    const data = rows.map(convertBigIntToNumber);
    return { data, total: totalCount, page, limit, pages: Math.ceil(totalCount / limit) };
  }

  async getShipByUuid(uuid: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    if (uuid.startsWith('concept-')) {
      const smId = uuid.replace('concept-', '');
      const rows = await prisma.$queryRawUnsafe<Row[]>(
        `SELECT ${CONCEPT_SELECT}, TRUE as is_concept_only FROM starvis.ship_matrix sm2 WHERE sm2.id = ? AND sm2.id NOT IN (SELECT ship_matrix_id FROM ships WHERE ship_matrix_id IS NOT NULL)`,
        smId,
      );
      return rows[0] ? convertBigIntToNumber(rows[0]) : null;
    }
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT ${SHIP_SELECT}, s.game_data, FALSE as is_concept_only,
              sm.length as sm_length, sm.beam as sm_beam, sm.height as sm_height
       ${SHIP_JOINS} WHERE s.uuid = ?`,
      uuid,
    );
    if (!rows[0]) return null;
    const ship = rows[0];
    // Fallback: use Ship Matrix dimensions if P4K bbox is missing (no extra query needed)
    if (!num(ship.size_y)) {
      if (ship.sm_beam) ship.size_x = num(ship.sm_beam); // beam   → width  (size_x)
      if (ship.sm_length) ship.size_y = num(ship.sm_length); // length → depth  (size_y)
      if (ship.sm_height) ship.size_z = num(ship.sm_height); // height → height (size_z)
    }
    // Remove internal-only fields before returning
    delete (ship as any).sm_length;
    delete (ship as any).sm_beam;
    delete (ship as any).sm_height;
    return convertBigIntToNumber(ship);
  }

  async getShipByClassName(className: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT ${SHIP_SELECT}, FALSE as is_concept_only ${SHIP_JOINS} WHERE s.class_name = ?`,
      className,
    );
    return rows[0] ? convertBigIntToNumber(rows[0]) : null;
  }

  async getShipFilters(env = 'live'): Promise<{
    manufacturers: { code: string; name: string }[];
    roles: string[];
    careers: string[];
    variant_types: string[];
  }> {
    const prisma = this.getClient(env);
    const [mfgRows, roleRows, careerRows, variantRows] = await Promise.all([
      prisma.$queryRawUnsafe<Row[]>(
        `SELECT DISTINCT s.manufacturer_code as code, COALESCE(m.name, s.manufacturer_code) as name
         FROM ships s LEFT JOIN starvis.manufacturers m ON s.manufacturer_code = m.code
         WHERE s.manufacturer_code IS NOT NULL AND s.manufacturer_code != ''
         ORDER BY name`,
      ),
      prisma.$queryRawUnsafe<Row[]>("SELECT DISTINCT role FROM ships WHERE role IS NOT NULL AND role != '' ORDER BY role"),
      prisma.$queryRawUnsafe<Row[]>("SELECT DISTINCT career FROM ships WHERE career IS NOT NULL AND career != '' ORDER BY career"),
      prisma.$queryRawUnsafe<Row[]>(
        "SELECT DISTINCT variant_type FROM ships WHERE variant_type IS NOT NULL AND variant_type != '' AND variant_type != 'npc' ORDER BY variant_type",
      ),
    ]);
    return {
      manufacturers: mfgRows.map((r) => ({ code: String(r.code), name: String(r.name) })),
      roles: roleRows.map((r) => String(r.role)),
      careers: careerRows.map((r) => String(r.career)),
      variant_types: variantRows.map((r) => String(r.variant_type)),
    };
  }

  async getAllManufacturers(env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT m.*, COUNT(DISTINCT c.uuid) as component_count, COUNT(DISTINCT s.uuid) as ship_count
       FROM starvis.manufacturers m LEFT JOIN components c ON m.code = c.manufacturer_code LEFT JOIN ships s ON m.code = s.manufacturer_code
       GROUP BY m.code ORDER BY m.name`,
    );
    // Convert BigInt to Number for JSON serialization
    return rows.map((r) => ({ ...r, component_count: Number(r.component_count), ship_count: Number(r.ship_count) }));
  }

  async getShipManufacturers(env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT m.code, m.name, COUNT(s.uuid) as ship_count
       FROM starvis.manufacturers m INNER JOIN ships s ON m.code = s.manufacturer_code
       GROUP BY m.code, m.name ORDER BY m.name`,
    );
    // Convert BigInt to Number for JSON serialization
    return rows.map((r) => ({ ...r, ship_count: Number(r.ship_count) }));
  }

  async getManufacturerByCode(code: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT m.*, COUNT(DISTINCT s.uuid) as ship_count, COUNT(DISTINCT c.uuid) as component_count
       FROM starvis.manufacturers m
       LEFT JOIN ships s ON m.code = s.manufacturer_code
       LEFT JOIN components c ON m.code = c.manufacturer_code
       WHERE m.code = ?
       GROUP BY m.code`,
      code.toUpperCase(),
    );
    const raw = rows[0];
    if (!raw) return null;
    // Convert BigInt to Number for JSON serialization
    return { ...raw, ship_count: Number(raw.ship_count), component_count: Number(raw.component_count) };
  }

  async getManufacturerShips(code: string, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT ${SHIP_SELECT}, FALSE as is_concept_only ${SHIP_JOINS}
       WHERE s.manufacturer_code = ? AND (s.variant_type IS NULL OR s.variant_type NOT IN ('tutorial','enemy_ai','arena_ai','competition'))
       ORDER BY s.name`,
      code.toUpperCase(),
    );
    return rows.map(convertBigIntToNumber);
  }

  async getManufacturerComponents(code: string, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT c.uuid, c.class_name, c.name, c.type, c.sub_type, c.size, c.grade, c.manufacturer_code,
              m.name as manufacturer_name
       FROM components c LEFT JOIN starvis.manufacturers m ON c.manufacturer_code = m.code
       WHERE c.manufacturer_code = ? ORDER BY c.type, c.size, c.name`,
      code.toUpperCase(),
    );
    return rows;
  }

  async searchShipsAutocomplete(q: string, limit = 10, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const t = `%${q}%`;
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT s.uuid, COALESCE(sm.name, s.name) as name, s.class_name, s.manufacturer_code,
              m.name as manufacturer_name, sm.media_store_small as thumbnail,
              s.vehicle_category
       ${SHIP_JOINS}
       WHERE (s.name LIKE ? OR s.class_name LIKE ? OR s.short_name LIKE ? OR sm.name LIKE ?)
         AND (s.variant_type IS NULL OR s.variant_type NOT IN ('tutorial','enemy_ai','arena_ai','competition'))
       ORDER BY s.name LIMIT ${Number(Math.min(limit, 20))}`,
      t,
      t,
      t,
      t,
    );
    return rows.map(convertBigIntToNumber);
  }

  async getRandomShip(env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    // ORDER BY RAND() is O(n) — use count + random offset instead
    const countRows = await prisma.$queryRawUnsafe<Row[]>(
      "SELECT COUNT(*) as total FROM ships WHERE variant_type IS NULL AND vehicle_category = 'ship'",
    );
    const total = Number(countRows[0]?.total) || 0;
    if (total === 0) return null;
    const offset = Math.floor(Math.random() * total);

    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT ${SHIP_SELECT}, FALSE as is_concept_only ${SHIP_JOINS}
       WHERE s.variant_type IS NULL AND s.vehicle_category = 'ship'
       LIMIT 1 OFFSET ${offset}`,
    );
    if (!rows[0]) return null;
    return convertBigIntToNumber(rows[0]);
  }

  async getSimilarShips(uuid: string, limit = 5, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const shipRows = await prisma.$queryRawUnsafe<Row[]>(
      'SELECT role, vehicle_category, manufacturer_code FROM ships WHERE uuid = ?',
      uuid,
    );
    if (!shipRows[0]) return [];
    const ship = shipRows[0];

    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT ${SHIP_SELECT}, FALSE as is_concept_only ${SHIP_JOINS}
       WHERE s.uuid != ? AND s.variant_type IS NULL
         AND s.vehicle_category = ?
         AND (s.role = ? OR s.manufacturer_code = ?)
       ORDER BY (s.role = ?) DESC, s.name
       LIMIT ${Number(Math.min(limit, 10))}`,
      uuid,
      ship.vehicle_category,
      ship.role,
      ship.manufacturer_code,
      ship.role,
    );
    return rows.map(convertBigIntToNumber);
  }

  /** Get all ships sharing the same chassis_id (variants of the same hull) */
  async getShipVariants(uuid: string, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const shipRows = await prisma.$queryRawUnsafe<Row[]>('SELECT chassis_id FROM ships WHERE uuid = ?', uuid);
    const chassisId = shipRows[0]?.chassis_id;
    if (!chassisId) return [];

    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT ${SHIP_SELECT}, FALSE as is_concept_only ${SHIP_JOINS}
       WHERE s.chassis_id = ? AND s.uuid != ?
       ORDER BY COALESCE(sm.name, s.name)`,
      chassisId,
      uuid,
    );
    return rows.map(convertBigIntToNumber);
  }

  /** Get a lightweight variant summary for a ship (uuid, name, thumbnail) */
  async getVariantSummary(chassisId: number, currentUuid: string, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT s.uuid, COALESCE(sm.name, s.name) as name, s.class_name,
              sm.media_store_small as thumbnail, s.variant_type
       FROM ships s
       LEFT JOIN starvis.ship_matrix sm ON s.ship_matrix_id = sm.id
       WHERE s.chassis_id = ? AND s.uuid != ?
       ORDER BY COALESCE(sm.name, s.name)`,
      chassisId,
      currentUuid,
    );
    return rows.map(convertBigIntToNumber);
  }
}
