/**
 * GameDataService — Read-only query service for game data stored in MySQL
 *
 * All extraction logic lives in the standalone extractor package.
 * This service only reads data for the REST API.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

// ── Types ─────────────────────────────────────────────────

/** A single row returned by mysql2 queries */
type Row = RowDataPacket & Record<string, unknown>;

interface PaginatedResult {
  data: Row[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ── Helpers ───────────────────────────────────────────────

const num = (v: unknown): number => parseFloat(String(v)) || 0;
const int = (v: unknown): number => parseInt(String(v)) || 0;
const r2 = (v: number): number => Math.round(v * 100) / 100;
const r4 = (v: number): number => Math.round(v * 10000) / 10000;
const r6 = (v: number): number => Math.round(v * 1000000) / 1000000;
const r1 = (v: number): number => Math.round(v * 10) / 10;

const SHIP_SELECT = `s.uuid, s.class_name, COALESCE(sm.name, s.name) as name, s.manufacturer_code, m.name as manufacturer_name,
  s.career, s.role, s.mass, s.total_hp,
  s.scm_speed, s.max_speed, s.boost_speed_forward, s.boost_speed_backward,
  s.pitch_max, s.yaw_max, s.roll_max,
  s.hydrogen_fuel_capacity, s.quantum_fuel_capacity,
  s.cargo_capacity, s.crew_size, s.shield_hp,
  s.missile_damage_total, s.weapon_damage_total,
  s.armor_physical, s.armor_energy, s.armor_distortion,
  s.cross_section_x, s.cross_section_y, s.cross_section_z,
  s.ship_matrix_id,
  sm.media_store_small as thumbnail, sm.media_store_large as thumbnail_large,
  sm.production_status, sm.description as sm_description,
  sm.url as store_url, sm.cargocapacity as sm_cargo,
  s.vehicle_category, s.insurance_claim_time, s.insurance_expedite_cost,
  s.short_name, s.variant_type, s.game_data`;

/** Concept-only columns: ship_matrix entries without P4K data */
const CONCEPT_SELECT = `CONCAT('concept-', sm2.id) as uuid, LOWER(REPLACE(REPLACE(sm2.name, ' ', '_'), '''', '')) as class_name,
  sm2.name, sm2.manufacturer_code, sm2.manufacturer_name as manufacturer_name,
  NULL as career, NULL as role, sm2.mass, NULL as total_hp,
  sm2.scm_speed, sm2.afterburner_speed as max_speed,
  NULL as boost_speed_forward, NULL as boost_speed_backward,
  sm2.pitch_max, sm2.yaw_max, sm2.roll_max,
  NULL as hydrogen_fuel_capacity, NULL as quantum_fuel_capacity,
  sm2.cargocapacity as cargo_capacity, sm2.min_crew as crew_size, NULL as shield_hp,
  NULL as missile_damage_total, NULL as weapon_damage_total,
  NULL as armor_physical, NULL as armor_energy, NULL as armor_distortion,
  NULL as cross_section_x, NULL as cross_section_y, NULL as cross_section_z,
  sm2.id as ship_matrix_id,
  sm2.media_store_small as thumbnail, sm2.media_store_large as thumbnail_large,
  sm2.production_status, sm2.description as sm_description,
  sm2.url as store_url, sm2.cargocapacity as sm_cargo,
  NULL as vehicle_category, NULL as insurance_claim_time, NULL as insurance_expedite_cost,
  NULL as short_name, NULL as variant_type, NULL as game_data`;

const SHIP_JOINS = `FROM ships s
  LEFT JOIN manufacturers m ON s.manufacturer_code = m.code
  LEFT JOIN ship_matrix sm ON s.ship_matrix_id = sm.id`;

const SHIP_SORT = new Set([
  "name", "class_name", "manufacturer_code", "mass", "scm_speed", "max_speed",
  "total_hp", "shield_hp", "crew_size", "cargo_capacity", "missile_damage_total",
  "weapon_damage_total", "armor_physical", "armor_energy", "armor_distortion",
  "cross_section_x", "cross_section_y", "cross_section_z",
  "hydrogen_fuel_capacity", "quantum_fuel_capacity", "boost_speed_forward",
  "pitch_max", "yaw_max", "roll_max",
]);

const COMP_SORT = new Set([
  "name", "class_name", "type", "size", "grade", "manufacturer_code",
  "weapon_dps", "weapon_burst_dps", "weapon_sustained_dps", "weapon_damage",
  "weapon_fire_rate", "weapon_range", "weapon_damage_physical",
  "weapon_damage_energy", "weapon_damage_distortion", "shield_hp", "shield_regen",
  "qd_speed", "qd_spool_time", "power_output", "cooling_rate", "hp", "mass",
  "thruster_max_thrust", "radar_range", "fuel_capacity",
]);

const UTILITY_WEAPON_RX = /tractor|mining|salvage|repair|grin_tractor|grin_salvage/i;
const RELEVANT_TYPES = new Set([
  "WeaponGun", "Shield", "PowerPlant", "Cooler", "QuantumDrive",
  "Countermeasure", "Missile", "Radar", "EMP", "QuantumInterdictionGenerator",
]);

/** Detect utility weapon sub-type from name/class_name */
function detectUtilityType(name: string, className: string): string {
  const s = `${name} ${className}`.toLowerCase();
  if (/mining|orion_mining/i.test(s)) return "MiningLaser";
  if (/salvage|reclaim/i.test(s)) return "SalvageHead";
  if (/tractor|grin_tractor/i.test(s)) return "TractorBeam";
  if (/repair/i.test(s)) return "RepairBeam";
  return "UtilityWeapon";
}

function cleanName(name: string, type: string): string {
  if (!name) return "—";
  let c = name;
  if (["Shield", "QuantumDrive", "PowerPlant", "Cooler", "Radar", "Missile"].includes(type))
    c = c.replace(/^S\d{2}\s+/, "");
  if (type === "Countermeasure") {
    const m = c.match(/(CML\s+.+)/i);
    if (m) c = m[1];
  }
  c = c.replace(/\s*SCItem.*$/i, "").replace(/\s*_Resist.*$/i, "");
  return c.trim() || "—";
}

// ── Service ───────────────────────────────────────────────

export class GameDataService {
  constructor(private pool: Pool) {}

  // ── Pagination helper (shared by ships, components, shops) ──

  private async paginate(
    baseSql: string,
    countSql: string,
    params: (string | number)[],
    opts: { sort?: string; order?: string; page?: number; limit?: number },
    sortCols: Set<string>,
    alias: string,
  ): Promise<PaginatedResult> {
    const [countRows] = await this.pool.execute<Row[]>(countSql, params);
    const total = countRows[0]?.total ?? countRows[0]?.count ?? 0;

    const sortCol = sortCols.has(opts.sort || "") ? opts.sort! : "name";
    const order = opts.order === "desc" ? "DESC" : "ASC";
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(200, Math.max(1, opts.limit || 50));
    const offset = (page - 1) * limit;

    const sql = `${baseSql} ORDER BY ${alias}.${sortCol} ${order} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
    const [rows] = await this.pool.execute<Row[]>(sql, params);
    return { data: rows, total: Number(total), page, limit, pages: Math.ceil(Number(total) / limit) };
  }

  // ── SHIPS ───────────────────────────────────────────────

  async getAllShips(filters?: {
    manufacturer?: string; role?: string; career?: string; status?: string;
    vehicle_category?: string; variant_type?: string; search?: string;
    sort?: string; order?: string; page?: number; limit?: number;
  }): Promise<PaginatedResult> {
    const where: string[] = [];
    const params: (string | number)[] = [];

    // Build WHERE conditions for the main (P4K) ships query
    if (filters?.manufacturer) { where.push("s.manufacturer_code = ?"); params.push(filters.manufacturer.toUpperCase()); }
    if (filters?.role) { where.push("s.role = ?"); params.push(filters.role); }
    if (filters?.career) { where.push("s.career = ?"); params.push(filters.career); }
    if (filters?.vehicle_category) { where.push("s.vehicle_category = ?"); params.push(filters.vehicle_category); }
    if (filters?.variant_type) {
      if (filters.variant_type === "none") { where.push("s.variant_type IS NULL"); }
      else { where.push("s.variant_type = ?"); params.push(filters.variant_type); }
    }

    // Status filter — special handling
    const wantConceptOnly = filters?.status === "in-concept";
    const wantInGameOnly = filters?.status === "in-game-only";
    const wantFlightReady = filters?.status === "flight-ready";
    const excludeConcept = wantInGameOnly || wantFlightReady;

    if (wantFlightReady) { where.push("sm.production_status = ?"); params.push("flight-ready"); }
    if (wantInGameOnly) { where.push("s.ship_matrix_id IS NULL"); }

    if (filters?.search) {
      where.push("(s.name LIKE ? OR s.class_name LIKE ? OR s.short_name LIKE ? OR sm.name LIKE ?)");
      const t = `%${filters.search}%`;
      params.push(t, t, t, t);
    }

    const w = where.length ? ` WHERE ${where.join(" AND ")}` : "";

    // --- Concept-only ships (ship_matrix entries without P4K data) ---
    // Include them unless filtering by a P4K-specific status or vehicle_category
    const includeConceptShips = !excludeConcept && !filters?.vehicle_category;

    // Concept WHERE clause
    const conceptWhere: string[] = ["sm2.id NOT IN (SELECT ship_matrix_id FROM ships WHERE ship_matrix_id IS NOT NULL)"];
    const conceptParams: (string | number)[] = [];
    if (wantConceptOnly) {
      // Only concept ships
    }
    if (filters?.manufacturer) { conceptWhere.push("sm2.manufacturer_code = ?"); conceptParams.push(filters.manufacturer.toUpperCase()); }
    if (filters?.search) {
      conceptWhere.push("(sm2.name LIKE ? OR sm2.manufacturer_name LIKE ?)");
      const t = `%${filters.search}%`;
      conceptParams.push(t, t);
    }
    const cw = ` WHERE ${conceptWhere.join(" AND ")}`;

    // Count
    let totalCount = 0;
    if (!wantConceptOnly) {
      const [countRows] = await this.pool.execute<Row[]>(`SELECT COUNT(*) as total FROM ships s LEFT JOIN ship_matrix sm ON s.ship_matrix_id = sm.id${w}`, params);
      totalCount += Number(countRows[0]?.total) || 0;
    }
    if (includeConceptShips || wantConceptOnly) {
      const [conceptCount] = await this.pool.execute<Row[]>(`SELECT COUNT(*) as total FROM ship_matrix sm2${cw}`, conceptParams);
      totalCount += Number(conceptCount[0]?.total) || 0;
    }

    const sortCol = SHIP_SORT.has(filters?.sort || "") ? filters!.sort! : "name";
    const order = filters?.order === "desc" ? "DESC" : "ASC";
    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(200, Math.max(1, filters?.limit || 50));
    const offset = (page - 1) * limit;

    // Use UNION ALL to merge P4K ships + concept-only ship_matrix entries
    let sql: string;
    let allParams: (string | number)[];

    if (wantConceptOnly) {
      // Only concept ships
      sql = `SELECT ${CONCEPT_SELECT}, TRUE as is_concept_only
        FROM ship_matrix sm2${cw}
        ORDER BY sm2.name ${order} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
      allParams = [...conceptParams];
    } else if (includeConceptShips) {
      // Both P4K ships and concept ships
      sql = `(SELECT ${SHIP_SELECT}, FALSE as is_concept_only ${SHIP_JOINS}${w})
        UNION ALL
        (SELECT ${CONCEPT_SELECT}, TRUE as is_concept_only
          FROM ship_matrix sm2${cw})
        ORDER BY name ${order} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
      allParams = [...params, ...conceptParams];
    } else {
      // P4K ships only (flight-ready or in-game-only filters)
      sql = `SELECT ${SHIP_SELECT}, FALSE as is_concept_only ${SHIP_JOINS}${w}
        ORDER BY s.${sortCol} ${order} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
      allParams = [...params];
    }

    const [rows] = await this.pool.execute<Row[]>(sql, allParams);
    const data = rows.map(({ game_data, ...rest }) => rest as Row);
    return { data, total: totalCount, page, limit, pages: Math.ceil(totalCount / limit) };
  }

  async getShipByUuid(uuid: string): Promise<Row | null> {
    // Handle concept-only ships (uuid = "concept-{sm_id}")
    if (uuid.startsWith("concept-")) {
      const smId = uuid.replace("concept-", "");
      const [rows] = await this.pool.execute<Row[]>(
        `SELECT ${CONCEPT_SELECT}, TRUE as is_concept_only FROM ship_matrix sm2 WHERE sm2.id = ? AND sm2.id NOT IN (SELECT ship_matrix_id FROM ships WHERE ship_matrix_id IS NOT NULL)`,
        [smId],
      );
      return rows[0] || null;
    }
    const [rows] = await this.pool.execute<Row[]>(`SELECT ${SHIP_SELECT}, FALSE as is_concept_only ${SHIP_JOINS} WHERE s.uuid = ?`, [uuid]);
    if (!rows[0]) return null;
    const ship = rows[0];
    // Cross-section fallback from ship_matrix dimensions
    if (!ship.cross_section_x && !ship.cross_section_y && !ship.cross_section_z && ship.ship_matrix_id) {
      const [smRows] = await this.pool.execute<Row[]>("SELECT length, beam, height FROM ship_matrix WHERE id = ?", [ship.ship_matrix_id]);
      if (smRows.length) {
        ship.cross_section_x = num(smRows[0].length);
        ship.cross_section_y = num(smRows[0].beam);
        ship.cross_section_z = num(smRows[0].height);
      }
    }
    return ship;
  }

  async getShipByClassName(className: string): Promise<Row | null> {
    const [rows] = await this.pool.execute<Row[]>(`SELECT ${SHIP_SELECT}, FALSE as is_concept_only ${SHIP_JOINS} WHERE s.class_name = ?`, [className]);
    return rows[0] || null;
  }

  // ── COMPONENTS ──────────────────────────────────────────

  async getAllComponents(filters?: {
    type?: string; sub_type?: string; size?: string; grade?: string;
    min_size?: string; max_size?: string;
    manufacturer?: string; search?: string;
    sort?: string; order?: string; page?: number; limit?: number;
  }): Promise<PaginatedResult> {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.type) { where.push("c.type = ?"); params.push(filters.type); }
    if (filters?.sub_type) { where.push("c.sub_type = ?"); params.push(filters.sub_type); }
    if (filters?.size) { where.push("c.size = ?"); params.push(parseInt(filters.size)); }
    if (filters?.min_size) { where.push("c.size >= ?"); params.push(parseInt(filters.min_size)); }
    if (filters?.max_size) { where.push("c.size <= ?"); params.push(parseInt(filters.max_size)); }
    if (filters?.grade) { where.push("c.grade = ?"); params.push(filters.grade); }
    if (filters?.manufacturer) { where.push("c.manufacturer_code = ?"); params.push(filters.manufacturer.toUpperCase()); }
    if (filters?.search) {
      where.push("(c.name LIKE ? OR c.class_name LIKE ?)");
      const t = `%${filters.search}%`;
      params.push(t, t);
    }

    const w = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const baseSql = `SELECT c.*, m.name as manufacturer_name FROM components c LEFT JOIN manufacturers m ON c.manufacturer_code = m.code${w}`;
    const countSql = `SELECT COUNT(*) as total FROM components c${w}`;

    return this.paginate(baseSql, countSql, params, filters || {}, COMP_SORT, "c");
  }

  async getComponentByUuid(uuid: string): Promise<Row | null> {
    const [rows] = await this.pool.execute<Row[]>(
      "SELECT c.*, m.name as manufacturer_name FROM components c LEFT JOIN manufacturers m ON c.manufacturer_code = m.code WHERE c.uuid = ?",
      [uuid],
    );
    return rows[0] || null;
  }

  async getComponentByClassName(className: string): Promise<Row | null> {
    const [rows] = await this.pool.execute<Row[]>(
      "SELECT c.*, m.name as manufacturer_name FROM components c LEFT JOIN manufacturers m ON c.manufacturer_code = m.code WHERE c.class_name = ?",
      [className],
    );
    return rows[0] || null;
  }

  /** Resolve UUID or class_name → component */
  async resolveComponent(id: string): Promise<Row | null> {
    return id.length === 36
      ? await this.getComponentByUuid(id)
      : await this.getComponentByClassName(id);
  }

  // ── MANUFACTURERS ───────────────────────────────────────

  async getAllManufacturers(): Promise<Row[]> {
    const [rows] = await this.pool.execute<Row[]>(
      `SELECT m.*, COUNT(DISTINCT c.uuid) as component_count, COUNT(DISTINCT s.uuid) as ship_count
       FROM manufacturers m LEFT JOIN components c ON m.code = c.manufacturer_code LEFT JOIN ships s ON m.code = s.manufacturer_code
       GROUP BY m.code ORDER BY m.name`,
    );
    return rows;
  }

  async getShipManufacturers(): Promise<Row[]> {
    const [rows] = await this.pool.execute<Row[]>(
      `SELECT m.code, m.name, COUNT(s.uuid) as ship_count
       FROM manufacturers m INNER JOIN ships s ON m.code = s.manufacturer_code
       GROUP BY m.code, m.name ORDER BY m.name`,
    );
    return rows;
  }

  // ── FILTERS ─────────────────────────────────────────────

  async getShipFilters(): Promise<{ roles: string[]; careers: string[]; variant_types: string[] }> {
    const [roleRows] = await this.pool.execute<Row[]>("SELECT DISTINCT role FROM ships WHERE role IS NOT NULL AND role != '' ORDER BY role");
    const [careerRows] = await this.pool.execute<Row[]>("SELECT DISTINCT career FROM ships WHERE career IS NOT NULL AND career != '' ORDER BY career");
    const [variantRows] = await this.pool.execute<Row[]>("SELECT DISTINCT variant_type FROM ships WHERE variant_type IS NOT NULL AND variant_type != '' ORDER BY variant_type");
    return {
      roles: roleRows.map((r) => String(r.role)),
      careers: careerRows.map((r) => String(r.career)),
      variant_types: variantRows.map((r) => String(r.variant_type)),
    };
  }

  async getComponentFilters(): Promise<{ types: string[]; sub_types: string[]; sizes: number[]; grades: string[] }> {
    const [typeRows] = await this.pool.execute<Row[]>("SELECT DISTINCT type FROM components WHERE type IS NOT NULL AND type != '' ORDER BY type");
    const [subTypeRows] = await this.pool.execute<Row[]>("SELECT DISTINCT sub_type FROM components WHERE sub_type IS NOT NULL AND sub_type != '' ORDER BY sub_type");
    const [sizeRows] = await this.pool.execute<Row[]>("SELECT DISTINCT size FROM components ORDER BY size");
    const [gradeRows] = await this.pool.execute<Row[]>("SELECT DISTINCT grade FROM components WHERE grade IS NOT NULL AND grade != '' ORDER BY grade");
    return {
      types: typeRows.map((r) => String(r.type)),
      sub_types: subTypeRows.map((r) => String(r.sub_type)),
      sizes: sizeRows.map((r) => Number(r.size)),
      grades: gradeRows.map((r) => String(r.grade)),
    };
  }

  // ── LOADOUT ─────────────────────────────────────────────

  async getShipLoadout(shipUuid: string): Promise<Row[]> {
    const [rows] = await this.pool.execute(
      `SELECT sl.id, sl.port_name, sl.port_type, sl.component_class_name, sl.component_uuid,
              sl.port_min_size, sl.port_max_size, sl.parent_id,
              c.name as component_name, c.type as component_type, c.sub_type,
              c.size as component_size, c.grade, c.manufacturer_code,
              c.weapon_dps, c.weapon_damage, c.weapon_fire_rate, c.weapon_range,
              c.shield_hp, c.shield_regen, c.shield_regen_delay,
              c.qd_speed, c.qd_spool_time,
              c.power_output, c.cooling_rate,
              c.missile_damage, c.missile_signal_type
       FROM ships_loadouts sl LEFT JOIN components c ON sl.component_uuid = c.uuid
       WHERE sl.ship_uuid = ? ORDER BY sl.port_type, sl.port_name`,
      [shipUuid],
    );
    return rows as Row[];
  }

  async getShipModules(shipUuid: string): Promise<Row[]> {
    // Filter out noise modules (cargo grids, AI modules, dashboards, seats, nacelles, etc.)
    // Keep only real swappable modules (Retaliator front/rear, Apollo rooms, Cyclone attach, etc.)
    const NOISE_PATTERNS = [
      'cargogrid_module', 'pdc_aimodule', 'module_dashboard',
      'module_seat', 'thruster_module', 'power_plant_commandmodule',
      'cargo_module', 'modular_bed',
    ];
    const noiseClauses = NOISE_PATTERNS.map(p => `slot_name NOT LIKE '%${p}%'`).join(' AND ');
    const [rows] = await this.pool.execute<Row[]>(
      `SELECT * FROM ship_modules WHERE ship_uuid = ? AND ${noiseClauses} ORDER BY slot_name`,
      [shipUuid],
    );
    return rows;
  }

  async getShipPaints(shipUuid: string): Promise<Row[]> {
    const [rows] = await this.pool.execute<Row[]>(
      "SELECT paint_class_name, paint_name, paint_uuid FROM ship_paints WHERE ship_uuid = ? ORDER BY paint_name",
      [shipUuid],
    );
    return rows;
  }

  // ── PAINTS (global listing) ─────────────────────────────

  async getAllPaints(opts: {
    search?: string; ship_uuid?: string;
    page?: number; limit?: number;
  }): Promise<PaginatedResult> {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (opts.search) {
      where.push("(sp.paint_name LIKE ? OR sp.paint_class_name LIKE ? OR s.name LIKE ?)");
      const t = `%${opts.search}%`;
      params.push(t, t, t);
    }
    if (opts.ship_uuid) {
      where.push("sp.ship_uuid = ?");
      params.push(opts.ship_uuid);
    }

    const w = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const baseSql = `SELECT sp.id, sp.ship_uuid, sp.paint_class_name, sp.paint_name, sp.paint_uuid, s.name as ship_name, s.class_name as ship_class_name, m.name as manufacturer_name, m.code as manufacturer_code FROM ship_paints sp LEFT JOIN ships s ON sp.ship_uuid = s.uuid LEFT JOIN manufacturers m ON s.manufacturer_code = m.code${w}`;
    const countSql = `SELECT COUNT(*) as total FROM ship_paints sp LEFT JOIN ships s ON sp.ship_uuid = s.uuid${w}`;

    const [countRows] = await this.pool.execute<Row[]>(countSql, params);
    const total = Number(countRows[0]?.total) || 0;

    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(200, Math.max(1, opts.limit || 50));
    const offset = (page - 1) * limit;

    const sql = `${baseSql} ORDER BY s.name, sp.paint_name LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
    const [rows] = await this.pool.execute<Row[]>(sql, params);
    return { data: rows, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ── CHANGELOG ───────────────────────────────────────────

  async getChangelog(params: { limit?: string; offset?: string; entityType?: string; changeType?: string }): Promise<{ data: Row[]; total: number }> {
    const where: string[] = [];
    const p: (string | number)[] = [];
    if (params.entityType) { where.push("c.entity_type = ?"); p.push(params.entityType); }
    if (params.changeType) { where.push("c.change_type = ?"); p.push(params.changeType); }

    const w = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const [countRows] = await this.pool.execute<Row[]>(`SELECT COUNT(*) as total FROM changelog c${w}`, p);
    const total = Number(countRows[0]?.total) || 0;

    const limit = Math.min(100, parseInt(params.limit || "50"));
    const offset = parseInt(params.offset || "0");
    const [rows] = await this.pool.execute<Row[]>(
      `SELECT c.*, e.game_version, e.extracted_at as extraction_date FROM changelog c LEFT JOIN extraction_log e ON c.extraction_id = e.id${w} ORDER BY c.created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      p,
    );
    return { data: rows, total };
  }

  // ── STATS (single query instead of 7 sequential SELECTs) ──

  async getStats(): Promise<Record<string, unknown>> {
    const [rows] = await this.pool.execute<Row[]>(`
      SELECT
        (SELECT COUNT(*) FROM ships) as ships,
        (SELECT COUNT(*) FROM components) as components,
        (SELECT COUNT(*) FROM manufacturers) as manufacturers,
        (SELECT COUNT(*) FROM ships_loadouts) as loadoutPorts,
        (SELECT COUNT(*) FROM ship_paints) as paints,
        (SELECT COUNT(*) FROM shops) as shops
    `);
    const latest = await this.getLatestExtraction();
    return { ...rows[0], latestExtraction: latest };
  }

  // ── SHOPS ───────────────────────────────────────────────

  async getShops(opts: { page?: number; limit?: number; location?: string; type?: string; search?: string }): Promise<{ data: Row[]; total: number; page: number; limit: number }> {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (opts.search) { where.push("(name LIKE ? OR location LIKE ? OR parent_location LIKE ?)"); const t = `%${opts.search}%`; params.push(t, t, t); }
    if (opts.location) { where.push("(location LIKE ? OR parent_location LIKE ?)"); const t = `%${opts.location}%`; params.push(t, t); }
    if (opts.type) { where.push("shop_type = ?"); params.push(opts.type); }

    const w = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(100, Math.max(1, opts.limit || 20));
    const offset = (page - 1) * limit;

    const [countRows] = await this.pool.execute<Row[]>(`SELECT COUNT(*) as count FROM shops${w}`, params);
    const total = Number(countRows[0].count);
    const [rows] = await this.pool.execute<Row[]>(`SELECT * FROM shops${w} ORDER BY name LIMIT ${Number(limit)} OFFSET ${Number(offset)}`, params);

    return { data: rows, total, page, limit };
  }

  async getShopInventory(shopId: number): Promise<Row[]> {
    const [rows] = await this.pool.execute<Row[]>(
      `SELECT si.*, c.name as component_name, c.type as component_type, c.size as component_size
       FROM shop_inventory si LEFT JOIN components c ON si.component_uuid = c.uuid
       WHERE si.shop_id = ? ORDER BY c.type, c.name`,
      [shopId],
    );
    return rows;
  }

  async getComponentBuyLocations(uuid: string): Promise<Row[]> {
    const [rows] = await this.pool.execute<Row[]>(
      `SELECT s.name as shop_name, s.location, s.parent_location, s.shop_type,
              si.base_price, si.rental_price_1d, si.rental_price_3d, si.rental_price_7d, si.rental_price_30d
       FROM shop_inventory si JOIN shops s ON si.shop_id = s.id
       WHERE si.component_uuid = ? ORDER BY si.base_price`,
      [uuid],
    );
    return rows;
  }

  async getComponentShips(uuid: string): Promise<Row[]> {
    const [rows] = await this.pool.execute<Row[]>(
      `SELECT DISTINCT s.uuid, s.name, s.class_name, s.manufacturer_code, s.manufacturer_name
       FROM ships_loadouts sl JOIN ships s ON sl.ship_uuid = s.uuid
       WHERE sl.component_uuid = ? ORDER BY s.name`,
      [uuid],
    );
    return rows;
  }

  // ── LOADOUT CALCULATOR ──────────────────────────────────

  async calculateLoadout(shipUuid: string, swaps: { portId?: number; portName?: string; componentUuid: string }[]): Promise<Record<string, unknown>> {
    // 1. Load ship
    const [shipRows] = await this.pool.execute<Row[]>(
      "SELECT s.*, COALESCE(sm.name, s.name) as display_name FROM ships s LEFT JOIN ship_matrix sm ON s.ship_matrix_id = sm.id WHERE s.uuid = ?",
      [shipUuid],
    );
    if (!shipRows.length) throw new Error("Ship not found");
    const ship = shipRows[0];

    // 2. Cross-section fallback from ship_matrix
    let crossX = num(ship.cross_section_x), crossY = num(ship.cross_section_y), crossZ = num(ship.cross_section_z);
    if (crossX === 0 && crossY === 0 && crossZ === 0 && ship.ship_matrix_id) {
      const [smRows] = await this.pool.execute<Row[]>("SELECT length, beam, height FROM ship_matrix WHERE id = ?", [ship.ship_matrix_id]);
      if (smRows.length) { crossX = num(smRows[0].length); crossY = num(smRows[0].beam); crossZ = num(smRows[0].height); }
    }

    // 3. Load ALL loadout ports with hierarchy info
    const [loadoutRows] = await this.pool.execute<Row[]>(
      `SELECT sl.id, sl.port_name, sl.port_type, sl.port_min_size, sl.port_max_size,
              sl.parent_id, sl.component_uuid, sl.component_class_name, sl.port_editable,
              c.*
       FROM ships_loadouts sl LEFT JOIN components c ON sl.component_uuid = c.uuid
       WHERE sl.ship_uuid = ?`,
      [shipUuid],
    );
    const loadout: Row[] = loadoutRows.map((row) => ({ ...row }) as Row);

    // 4. Apply swaps — supports both portId and portName
    if (swaps.length) {
      const swapByIdMap = new Map(swaps.filter(s => s.portId).map(s => [s.portId!, s.componentUuid]));
      const swapByNameMap = new Map(swaps.filter(s => s.portName && !s.portId).map(s => [s.portName!, s.componentUuid]));
      const swapUuids = [...new Set(swaps.map(s => s.componentUuid))];
      const swapComponents = new Map<string, Row>();

      if (swapUuids.length) {
        const ph = swapUuids.map(() => "?").join(",");
        const [compRows] = await this.pool.execute<Row[]>(`SELECT * FROM components WHERE uuid IN (${ph})`, swapUuids);
        for (const c of compRows) swapComponents.set(c.uuid, c);
      }

      for (const l of loadout) {
        const newUuid = swapByIdMap.get(l.id as number) || swapByNameMap.get(l.port_name as string);
        if (!newUuid) continue;
        const comp = swapComponents.get(newUuid);
        if (!comp) continue;
        l._swapped = true;
        for (const key of Object.keys(comp)) {
          if (key !== "uuid" && key !== "created_at" && key !== "updated_at") l[key] = comp[key];
        }
        l.component_uuid = comp.uuid;
      }
    }

    // 5. Aggregate stats (from flat loadout — unchanged)
    const stats = this.aggregateLoadoutStats(loadout, ship, crossX, crossY, crossZ);

    // 6. Build hierarchical hardpoints (Erkul-style)
    const hardpoints = this.buildHardpoints(loadout);

    // 7. Build legacy filtered loadout (backward compat)
    const filteredLoadout = loadout
      .filter((l) => {
        if (!l.component_uuid || !l.type) return false;
        if (!RELEVANT_TYPES.has(String(l.type))) return false;
        if (String(l.port_name)?.includes("controller") || l.port_name === "Radar" || String(l.port_name)?.endsWith("_helper")) return false;
        const isUtility = l.type === "WeaponGun" && UTILITY_WEAPON_RX.test(String(l.name || l.class_name || ""));
        if (l.type === "WeaponGun" && !isUtility && !(num(l.weapon_dps) > 0)) return false;
        return true;
      })
      .map((l) => {
        const isUtility = l.type === "WeaponGun" && UTILITY_WEAPON_RX.test(String(l.name || l.class_name || ""));
        const effectiveType = isUtility ? detectUtilityType(l.name || "", l.class_name || "") : l.type;
        return {
          port_id: l.id, port_name: l.port_name, port_type: l.port_type, component_uuid: l.component_uuid,
          component_name: l.name, display_name: cleanName(l.name, l.type),
          component_type: effectiveType, component_size: int(l.size) || null,
          grade: l.grade || null, manufacturer_code: l.manufacturer_code || null,
          port_min_size: l.port_min_size || null, port_max_size: l.port_max_size || null,
          ...(l.type === "WeaponGun" && !isUtility && { weapon_dps: num(l.weapon_dps) || null, weapon_range: num(l.weapon_range) || null }),
          ...(isUtility && { weapon_dps: num(l.weapon_dps) || null, weapon_damage: num(l.weapon_damage) || null, weapon_range: num(l.weapon_range) || null }),
          ...(l.type === "Shield" && { shield_hp: num(l.shield_hp) || null, shield_regen: num(l.shield_regen) || null }),
          ...(l.type === "PowerPlant" && { power_output: num(l.power_output) || null }),
          ...(l.type === "Cooler" && { cooling_rate: num(l.cooling_rate) || null }),
          ...(l.type === "QuantumDrive" && { qd_speed: num(l.qd_speed) || null }),
          ...(l.type === "Countermeasure" && { cm_ammo: int(l.cm_ammo_count) || null }),
          ...(l.type === "Radar" && { radar_range: num(l.radar_range) || null }),
          ...(l.type === "EMP" && { emp_damage: num(l.emp_damage) || null, emp_radius: num(l.emp_radius) || null }),
          ...(l.type === "QuantumInterdictionGenerator" && { qig_jammer_range: num(l.qig_jammer_range) || null, qig_snare_radius: num(l.qig_snare_radius) || null }),
          swapped: !!l._swapped,
        };
      });

    // 8. Load modules & paints
    const modules = await this.getShipModules(shipUuid);
    const paints = await this.getShipPaints(shipUuid);

    return {
      ship: { uuid: ship.uuid, name: ship.display_name || ship.name, class_name: ship.class_name },
      swaps: swaps.length,
      stats,
      hardpoints,
      loadout: filteredLoadout,
      modules,
      paints,
    };
  }

  // ── Hardpoint category mapping ──

  private portCategory(portType: string): string {
    const map: Record<string, string> = {
      WeaponGun: "Weapons", Weapon: "Weapons", Gimbal: "Weapons",
      Turret: "Turrets", TurretBase: "Turrets",
      MissileRack: "Missiles", Missile: "Missiles", MissileLauncher: "Missiles",
      Shield: "Shields", ShieldGenerator: "Shields",
      PowerPlant: "Power Plants",
      Cooler: "Coolers",
      QuantumDrive: "Quantum Drive",
      Radar: "Radar",
      EMP: "EMP",
      QuantumInterdictionGenerator: "QED",
      Countermeasure: "Countermeasures",
      MiningLaser: "Mining", SalvageHead: "Salvage",
      TractorBeam: "Tractor", RepairBeam: "Repair",
    };
    return map[portType] || "Other";
  }

  private static readonly CAT_ORDER: Record<string, number> = {
    Weapons: 1, Turrets: 2, Missiles: 3, Shields: 4,
    "Power Plants": 5, Coolers: 6, "Quantum Drive": 7,
    Radar: 8, EMP: 9, QED: 10, Countermeasures: 11,
    Mining: 12, Salvage: 13, Tractor: 14, Repair: 15,
  };

  // ── Build Erkul-style hierarchical hardpoints from flat loadout ──

  private buildHardpoints(loadout: Row[]): Record<string, unknown>[] {
    // 1. Build parent→child map
    const childMap = new Map<number, Row[]>();
    const rootPorts: Row[] = [];

    for (const port of loadout) {
      if (port.parent_id) {
        if (!childMap.has(port.parent_id as number)) childMap.set(port.parent_id as number, []);
        childMap.get(port.parent_id as number)!.push(port);
      } else {
        rootPorts.push(port);
      }
    }

    const RELEVANT_ROOT = new Set([
      "Gimbal", "Turret", "TurretBase", "MissileRack", "WeaponGun", "Weapon",
      "Shield", "PowerPlant", "Cooler", "QuantumDrive",
      "Radar", "Countermeasure", "EMP", "QuantumInterdictionGenerator",
      "WeaponRack",
    ]);

    const MOUNT_PORT_TYPES = new Set(["Gimbal", "Turret", "TurretBase", "MissileRack", "WeaponRack"]);

    const hardpoints: Record<string, unknown>[] = [];

    for (const root of rootPorts) {
      const portType = String(root.port_type || "");
      const portName = String(root.port_name || "");
      const allChildren = childMap.get(root.id as number) || [];

      // Skip controller/noise ports
      if (portName.includes("controller") || portName.endsWith("_helper")) continue;
      if (portName.includes("seat") || portName.includes("dashboard")) continue;
      if (portName.includes("paint") || portName.includes("self_destruct")) continue;
      if (portName.includes("landing") || portName.includes("relay")) continue;

      // Filter children to only relevant ones (skip screens, displays, MFDs, etc.)
      const children = allChildren.filter(c => {
        const cn = String(c.port_name || "");
        if (cn.startsWith("Screen_") || cn.startsWith("Display_") || cn.startsWith("Annunciator")) return false;
        if (cn.includes("_MFD") || cn.includes("dashboard") || cn.includes("HUD")) return false;
        const cpt = String(c.port_type || "");
        // Include if has component data, or is a mount/weapon port type, or has a component_class_name
        return (c.component_uuid && c.type) || RELEVANT_ROOT.has(cpt) || c.component_class_name;
      });

      const hasRelevantChildren = children.length > 0;

      // Skip ports that aren't relevant and have no children
      if (!RELEVANT_ROOT.has(portType) && !hasRelevantChildren) continue;

      // Detect mount type and size from component class_name
      let mountType: string | null = null;
      let mountSize: number | null = null;
      const compCls = String(root.component_class_name || "");

      if (MOUNT_PORT_TYPES.has(portType)) {
        if (/turret/i.test(compCls) || portType === "Turret" || portType === "TurretBase") mountType = "Turret";
        else if (/gimbal/i.test(compCls)) mountType = "Gimbal";
        else if (/fixed/i.test(compCls)) mountType = "Fixed";
        else if (/mrck|missilerack/i.test(compCls) || portType === "MissileRack") mountType = "Rack";
        else mountType = portType === "Turret" || portType === "TurretBase" ? "Turret" : portType === "MissileRack" ? "Rack" : "Gimbal";

        const sizeMatch = compCls.match(/[Ss](\d+)/);
        if (sizeMatch) mountSize = parseInt(sizeMatch[1]);
      }

      // Determine category — use actual component type when available (more accurate than port_type)
      const componentType = String(root.type || ""); // from JOIN with components table
      let category: string;

      if (componentType && this.portCategory(componentType) !== "Other") {
        // Component type is more accurate (e.g., EMP on MissileRack port)
        category = this.portCategory(componentType);
      } else {
        category = this.portCategory(portType);
      }

      // For mount ports with children, check if children override the category
      if (hasRelevantChildren && MOUNT_PORT_TYPES.has(portType)) {
        const childCompTypes = children.map(c => String(c.type || "")).filter(Boolean);
        if (childCompTypes.length > 0) {
          const childCat = this.portCategory(childCompTypes[0]);
          if (childCat !== "Other") {
            // If all children are EMP, override to EMP (not Missiles)
            if (childCompTypes.every(t => t === "EMP")) category = "EMP";
            // If children are WeaponGun and port is Turret → keep Turrets
            // If children are Gimbal (mount) → keep current category based on port_type
          }
        }
      }

      if (category === "Other" && hasRelevantChildren) {
        const firstChildType = String(children.find(c => c.type)?.type || children.find(c => c.port_type)?.port_type || "");
        category = this.portCategory(firstChildType);
      }
      if (category === "Other") continue;

      // Detect utility weapon at root
      const componentTypeStr = componentType || String(root.type || "");
      const isRootUtility = (componentTypeStr === "WeaponGun" || root.type === "WeaponGun") && UTILITY_WEAPON_RX.test(String(root.name || root.class_name || ""));
      if (isRootUtility) {
        category = this.portCategory(detectUtilityType(root.name || "", root.class_name || ""));
      }

      // Determine the effective port max size
      const effectiveMaxSize = int(root.port_max_size) || mountSize || int(root.size) || null;

      // Build component info for relevant children (includes mounts without component_uuid)
      const items = children
        .map(c => this.buildComponentInfo(c, childMap));

      // For ports with children (gimbals→weapons, racks→missiles, turrets→gimbals)
      if (hasRelevantChildren || (mountType && children.length > 0)) {
        hardpoints.push({
          port_id: root.id,
          port_name: portName,
          display_name: this.cleanPortName(portName),
          category,
          port_min_size: int(root.port_min_size) || null,
          port_max_size: effectiveMaxSize,
          mount_type: mountType,
          mount_class_name: compCls || null,
          mount_size: mountSize,
          component: null,
          items,
          swapped: !!root._swapped,
        });
      } else if (root.component_uuid && (root.type || componentType)) {
        // Direct component (shield, power plant, cooler, QD, CM, radar, EMP, etc.)
        hardpoints.push({
          port_id: root.id,
          port_name: portName,
          display_name: this.cleanPortName(portName),
          category,
          port_min_size: int(root.port_min_size) || null,
          port_max_size: effectiveMaxSize,
          mount_type: null,
          mount_class_name: null,
          mount_size: null,
          component: this.buildComponentInfo(root, childMap),
          items: [],
          swapped: !!root._swapped,
        });
      }
    }

    // Sort by category order, then by port_name within category
    hardpoints.sort((a, b) => {
      const orderA = GameDataService.CAT_ORDER[a.category as string] || 99;
      const orderB = GameDataService.CAT_ORDER[b.category as string] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return (a.port_name as string).localeCompare(b.port_name as string);
    });

    return hardpoints;
  }

  /** Parse mount display name from component_class_name (e.g., "Mount_Gimbal_S3" → "Gimbal S3") */
  private cleanMountName(className: string): string {
    if (!className) return "";
    // Remove common prefixes: Mount_, MRCK_, SCItem_, ANVL_, RSI_, etc.
    let name = className
      .replace(/^(Mount_|MRCK_|SCItem_|Vehicle_)/i, "")
      .replace(/_SCItem_.*/i, "")
      .replace(/^[A-Z]{3,4}_\w+_/, ""); // Remove manufacturer prefix like RSI_Constellation_
    // Parse size
    const sizeMatch = name.match(/[Ss](\d+)/);
    const size = sizeMatch ? ` S${sizeMatch[1]}` : "";
    // Clean the base name
    name = name
      .replace(/[Ss]\d+/g, "")
      .replace(/_+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!name) {
      // Fallback: use the whole className
      const parts = className.split("_");
      name = parts.length > 1 ? parts[1] : parts[0];
    }
    return `${name}${size}`.trim();
  }

  /** Build component info for a single loadout row */
  private buildComponentInfo(row: Row, childMap: Map<number, Row[]>): Record<string, unknown> {
    const type = String(row.type || row.port_type || "");
    const isUtility = type === "WeaponGun" && UTILITY_WEAPON_RX.test(String(row.name || row.class_name || ""));
    const effectiveType = isUtility ? detectUtilityType(row.name || "", row.class_name || "") : type;

    // For mount items (gimbals, racks, turrets) without component data, derive info from class name
    const isMountItem = !row.component_uuid && row.component_class_name;
    const mountDisplayName = isMountItem ? this.cleanMountName(String(row.component_class_name)) : "";
    const mountSize = isMountItem ? (String(row.component_class_name).match(/[Ss](\d+)/) || [])[1] : null;

    // Check for sub-children (e.g., turret → gimbal → weapons)
    const subChildren = childMap.get(row.id as number) || [];
    const relevantSubChildren = subChildren.filter(c => {
      const cn = String(c.port_name || "");
      if (cn.startsWith("Screen_") || cn.startsWith("Display_") || cn.startsWith("Annunciator")) return false;
      if (cn.includes("_MFD") || cn.includes("dashboard") || cn.includes("HUD")) return false;
      return c.component_uuid || c.type || c.component_class_name;
    });
    const subItems = relevantSubChildren.map(c => {
      const cIsMountItem = !c.component_uuid && c.component_class_name;
      const cMountName = cIsMountItem ? this.cleanMountName(String(c.component_class_name)) : "";
      const cMountSize = cIsMountItem ? (String(c.component_class_name).match(/[Ss](\d+)/) || [])[1] : null;
      return {
        port_id: c.id,
        port_name: c.port_name,
        uuid: c.component_uuid || null,
        name: c.name || (cIsMountItem ? c.component_class_name : null),
        display_name: c.name ? cleanName(c.name || "", String(c.type || "")) : cMountName,
        type: String(c.type || c.port_type || ""),
        size: int(c.size) || (cMountSize ? parseInt(cMountSize) : null),
        grade: c.grade || null,
        weapon_dps: num(c.weapon_dps) || null,
        weapon_range: num(c.weapon_range) || null,
        missile_damage: num(c.missile_damage) || null,
        swapped: !!c._swapped,
      };
    });

    return {
      port_id: row.id,
      port_name: row.port_name,
      uuid: row.component_uuid || null,
      name: row.name || (isMountItem ? row.component_class_name : null),
      display_name: row.name ? cleanName(row.name || "", type) : mountDisplayName,
      type: effectiveType,
      size: int(row.size) || (mountSize ? parseInt(mountSize) : null),
      grade: row.grade || null,
      manufacturer_code: row.manufacturer_code || null,
      // Stats
      ...(type === "WeaponGun" && !isUtility && {
        weapon_dps: r2(num(row.weapon_dps)) || null,
        weapon_burst_dps: r2(num(row.weapon_burst_dps)) || null,
        weapon_sustained_dps: r2(num(row.weapon_sustained_dps)) || null,
        weapon_range: Math.round(num(row.weapon_range)) || null,
      }),
      ...(isUtility && {
        weapon_dps: r2(num(row.weapon_dps)) || null,
        weapon_range: Math.round(num(row.weapon_range)) || null,
      }),
      ...(type === "Shield" && {
        shield_hp: r2(num(row.shield_hp)) || null,
        shield_regen: r2(num(row.shield_regen)) || null,
      }),
      ...(type === "PowerPlant" && { power_output: r2(num(row.power_output)) || null }),
      ...(type === "Cooler" && { cooling_rate: r2(num(row.cooling_rate)) || null }),
      ...(type === "QuantumDrive" && {
        qd_speed: r2(num(row.qd_speed)) || null,
        qd_spool_time: r2(num(row.qd_spool_time)) || null,
      }),
      ...(type === "Missile" && {
        missile_damage: r2(num(row.missile_damage)) || null,
        missile_signal_type: row.missile_signal_type || null,
        missile_speed: r2(num(row.missile_speed)) || null,
      }),
      ...(type === "Countermeasure" && { cm_ammo: int(row.cm_ammo_count) || null }),
      ...(type === "Radar" && { radar_range: r2(num(row.radar_range)) || null }),
      ...(type === "EMP" && {
        emp_damage: r2(num(row.emp_damage)) || null,
        emp_radius: r2(num(row.emp_radius)) || null,
      }),
      ...(type === "QuantumInterdictionGenerator" && {
        qig_jammer_range: r2(num(row.qig_jammer_range)) || null,
        qig_snare_radius: r2(num(row.qig_snare_radius)) || null,
      }),
      sub_items: subItems.length ? subItems : undefined,
      swapped: !!row._swapped,
    };
  }

  /** Clean port name for display (remove hardpoint_ prefix, underscores → spaces, title case) */
  private cleanPortName(name: string): string {
    return name
      .replace(/^hardpoint_/i, "")
      .replace(/^Hardpoint_/i, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  /** Aggregate stats from a loadout array — extracted from calculateLoadout */
  private aggregateLoadoutStats(loadout: Row[], ship: Row, crossX: number, crossY: number, crossZ: number): Record<string, unknown> {
    let totalDps = 0, totalBurstDps = 0, totalSustainedDps = 0;
    let totalShieldHp = 0, totalShieldRegen = 0;
    let totalPowerDraw = 0, totalPowerOutput = 0;
    let totalHeatGen = 0, totalCoolingRate = 0;
    let totalMissileDmg = 0;
    let weaponCount = 0, shieldCount = 0, missileCount = 0;
    let qdSpeed = 0, qdSpoolTime = 0, qdCooldown = 0, qdFuelRate = 0;
    let qdRange = 0, qdTuningRate = 0, qdAlignmentRate = 0, qdDisconnectRange = 0, qdName = "";

    const weapons: Record<string, unknown>[] = [], shields: Record<string, unknown>[] = [], missiles: Record<string, unknown>[] = [];
    const powerPlants: Record<string, unknown>[] = [], coolers: Record<string, unknown>[] = [];
    const cms: Record<string, unknown>[] = [], emps: Record<string, unknown>[] = [], qigs: Record<string, unknown>[] = [];
    const utilityWeapons: Record<string, unknown>[] = [];
    let cmFlare = 0, cmChaff = 0;

    for (const l of loadout) {
      if (!l.component_uuid) continue;

      if (l.type === "WeaponGun") {
        if (UTILITY_WEAPON_RX.test(l.name || "") || UTILITY_WEAPON_RX.test(l.class_name || "")) {
          // Collect utility weapons (mining, salvage, tractor, repair) separately
          const uType = detectUtilityType(l.name || "", l.class_name || "");
          utilityWeapons.push({
            port_name: l.port_name, name: l.name || "—", size: int(l.size),
            utility_type: uType, dps: r2(num(l.weapon_dps)), damage: r2(num(l.weapon_damage)),
            fire_rate: r2(num(l.weapon_fire_rate)), range: Math.round(num(l.weapon_range)),
          });
          continue;
        }
        const dps = num(l.weapon_dps);
        if (dps === 0) continue;
        totalDps += dps; totalBurstDps += num(l.weapon_burst_dps); totalSustainedDps += num(l.weapon_sustained_dps); weaponCount++;
        weapons.push({
          port_name: l.port_name, name: l.name || "—", size: int(l.size), grade: l.grade || "—",
          manufacturer: l.manufacturer_code || "", dps: r2(dps), alpha: r2(num(l.weapon_damage)),
          fire_rate: r2(num(l.weapon_fire_rate)), range: Math.round(num(l.weapon_range)),
          dmg_physical: r2(num(l.weapon_damage_physical)), dmg_energy: r2(num(l.weapon_damage_energy)),
          dmg_distortion: r2(num(l.weapon_damage_distortion)),
        });
      }
      if (l.type === "Shield") {
        const hp = num(l.shield_hp), regen = num(l.shield_regen);
        totalShieldHp += hp; totalShieldRegen += regen; shieldCount++;
        shields.push({
          port_name: l.port_name, name: cleanName(l.name, "Shield"), size: int(l.size),
          grade: l.grade || "—", manufacturer: l.manufacturer_code || "",
          hp: r2(hp), regen: r2(regen), regen_delay: r2(num(l.shield_regen_delay)),
          hardening: r4(num(l.shield_hardening)), time_to_charge: regen > 0 ? r1(hp / regen) : 0,
        });
      }
      if (l.type === "Missile" || l.type === "WeaponMissile") {
        const dmg = num(l.missile_damage); totalMissileDmg += dmg; missileCount++;
        missiles.push({
          port_name: l.port_name, name: cleanName(l.name, "Missile"), size: int(l.size),
          damage: r2(dmg), speed: r2(num(l.missile_speed)), range: r2(num(l.missile_range)),
          lock_time: r2(num(l.missile_lock_time)), lock_signal: l.missile_signal_type || "",
          dmg_physical: r2(num(l.missile_damage_physical)), dmg_energy: r2(num(l.missile_damage_energy)),
          dmg_distortion: r2(num(l.missile_damage_distortion)),
        });
      }
      if (l.type === "QuantumDrive") {
        qdSpeed = num(l.qd_speed); qdSpoolTime = num(l.qd_spool_time); qdCooldown = num(l.qd_cooldown);
        qdFuelRate = num(l.qd_fuel_rate); qdRange = num(l.qd_range); qdTuningRate = num(l.qd_tuning_rate);
        qdAlignmentRate = num(l.qd_alignment_rate); qdDisconnectRange = num(l.qd_disconnect_range); qdName = l.name || "";
      }
      if (l.type === "EMP") {
        emps.push({
          port_name: l.port_name, name: cleanName(l.name, "EMP"), size: int(l.size),
          damage: r2(num(l.emp_damage)), radius: r2(num(l.emp_radius)),
          charge_time: r2(num(l.emp_charge_time)), cooldown: r2(num(l.emp_cooldown)),
        });
      }
      if (l.type === "QuantumInterdictionGenerator") {
        qigs.push({
          port_name: l.port_name, name: cleanName(l.name, "QuantumInterdictionGenerator"), size: int(l.size),
          jammer_range: r2(num(l.qig_jammer_range)), snare_radius: r2(num(l.qig_snare_radius)),
          charge_time: r2(num(l.qig_charge_time)), cooldown: r2(num(l.qig_cooldown)),
        });
      }
      if (l.type === "PowerPlant") {
        const o = num(l.power_output); totalPowerOutput += o;
        powerPlants.push({
          port_name: l.port_name, name: cleanName(l.name, "PowerPlant"), size: int(l.size),
          grade: l.grade || "—", manufacturer: l.manufacturer_code || "", output: r2(o),
        });
      }
      if (l.type === "Cooler") {
        const c = num(l.cooling_rate); totalCoolingRate += c;
        coolers.push({
          port_name: l.port_name, name: cleanName(l.name, "Cooler"), size: int(l.size),
          grade: l.grade || "—", manufacturer: l.manufacturer_code || "", cooling_rate: r2(c),
        });
      }
      if (l.type === "Countermeasure") {
        const ammo = int(l.cm_ammo_count);
        const isFlare = /flare|decoy/i.test(l.name || ""), isChaff = /chaff|noise/i.test(l.name || "");
        if (isFlare) cmFlare += ammo;
        if (isChaff) cmChaff += ammo;
        cms.push({ port_name: l.port_name, name: cleanName(l.name, "Countermeasure"), type: isFlare ? "Flare" : isChaff ? "Chaff" : "Other", ammo_count: ammo });
      }
      totalPowerDraw += num(l.power_draw);
      totalHeatGen += num(l.heat_generation);
    }

    const hullHp = num(ship.total_hp);
    const armorPhys = num(ship.armor_physical) || 1;
    const armorEnergy = num(ship.armor_energy) || 1;
    const avgArmor = (armorPhys + armorEnergy) / 2;
    const ehp = avgArmor > 0 ? r2(totalShieldHp + hullHp / avgArmor) : totalShieldHp + hullHp;

    return {
      weapons: { count: weaponCount, total_dps: r2(totalDps), total_burst_dps: r2(totalBurstDps), total_sustained_dps: r2(totalSustainedDps), details: weapons },
      shields: { count: shieldCount, total_hp: r2(totalShieldHp), total_regen: r2(totalShieldRegen), time_to_charge: totalShieldRegen > 0 ? r1(totalShieldHp / totalShieldRegen) : 0, details: shields },
      missiles: { count: missileCount, total_damage: r2(totalMissileDmg), details: missiles },
      power: { total_draw: r2(totalPowerDraw), total_output: r2(totalPowerOutput), balance: r2(totalPowerOutput - totalPowerDraw), details: powerPlants },
      thermal: { total_heat_generation: r2(totalHeatGen), total_cooling_rate: r2(totalCoolingRate), balance: r2(totalCoolingRate - totalHeatGen), details: coolers },
      quantum: {
        drive_name: cleanName(qdName, "QuantumDrive"), speed: r2(qdSpeed), spool_time: r2(qdSpoolTime),
        cooldown: r2(qdCooldown), fuel_rate: r6(qdFuelRate), range: r2(qdRange),
        tuning_rate: r4(qdTuningRate), alignment_rate: r4(qdAlignmentRate), disconnect_range: r2(qdDisconnectRange),
        fuel_capacity: num(ship.quantum_fuel_capacity),
      },
      countermeasures: { flare_count: cmFlare, chaff_count: cmChaff, details: cms },
      emp: { count: emps.length, details: emps },
      quantum_interdiction: { count: qigs.length, details: qigs },
      utility: { count: utilityWeapons.length, details: utilityWeapons },
      signatures: { ir: num(ship.armor_signal_ir), em: num(ship.armor_signal_em), cs: num(ship.armor_signal_cs) },
      armor: { physical: num(ship.armor_physical), energy: num(ship.armor_energy), distortion: num(ship.armor_distortion), thermal: num(ship.armor_thermal) },
      mobility: {
        scm_speed: num(ship.scm_speed), max_speed: num(ship.max_speed),
        boost_forward: num(ship.boost_speed_forward), boost_backward: num(ship.boost_speed_backward),
        pitch: num(ship.pitch_max), yaw: num(ship.yaw_max), roll: num(ship.roll_max), mass: num(ship.mass),
      },
      fuel: { hydrogen: num(ship.hydrogen_fuel_capacity), quantum: num(ship.quantum_fuel_capacity) },
      hull: { total_hp: hullHp, ehp, cross_section_x: crossX, cross_section_y: crossY, cross_section_z: crossZ },
    };
  }

  // ── EXTRACTION LOG ──────────────────────────────────────

  async getExtractionLog(): Promise<Row[]> {
    const [rows] = await this.pool.execute<Row[]>("SELECT * FROM extraction_log ORDER BY extracted_at DESC LIMIT 20");
    return rows;
  }

  async getLatestExtraction(): Promise<Row | null> {
    const [rows] = await this.pool.execute<Row[]>("SELECT * FROM extraction_log ORDER BY extracted_at DESC LIMIT 1");
    return rows[0] || null;
  }
}
