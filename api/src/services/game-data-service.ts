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

const SHIP_SELECT = `s.*, m.name as manufacturer_name,
  sm.media_store_small as thumbnail, sm.media_store_large as thumbnail_large,
  sm.production_status, sm.description as sm_description,
  sm.url as store_url, sm.cargocapacity as sm_cargo`;

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
    vehicle_category?: string; search?: string;
    sort?: string; order?: string; page?: number; limit?: number;
  }): Promise<PaginatedResult> {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.manufacturer) { where.push("s.manufacturer_code = ?"); params.push(filters.manufacturer.toUpperCase()); }
    if (filters?.role) { where.push("s.role = ?"); params.push(filters.role); }
    if (filters?.career) { where.push("s.career = ?"); params.push(filters.career); }
    if (filters?.vehicle_category) { where.push("s.vehicle_category = ?"); params.push(filters.vehicle_category); }
    if (filters?.status) { where.push("sm.production_status = ?"); params.push(filters.status); }
    if (filters?.search) {
      where.push("(s.name LIKE ? OR s.class_name LIKE ? OR s.short_name LIKE ?)");
      const t = `%${filters.search}%`;
      params.push(t, t, t);
    }

    const w = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const baseSql = `SELECT ${SHIP_SELECT} ${SHIP_JOINS}${w}`;
    const countSql = `SELECT COUNT(*) as total FROM ships s LEFT JOIN ship_matrix sm ON s.ship_matrix_id = sm.id${w}`;

    const result = await this.paginate(baseSql, countSql, params, filters || {}, SHIP_SORT, "s");
    // Strip heavy game_data JSON from list view
    result.data = result.data.map(({ game_data, ...rest }) => rest as Row);
    return result;
  }

  async getShipByUuid(uuid: string): Promise<Row | null> {
    const [rows] = await this.pool.execute<Row[]>(`SELECT ${SHIP_SELECT} ${SHIP_JOINS} WHERE s.uuid = ?`, [uuid]);
    return rows[0] || null;
  }

  async getShipByClassName(className: string): Promise<Row | null> {
    const [rows] = await this.pool.execute<Row[]>(`SELECT ${SHIP_SELECT} ${SHIP_JOINS} WHERE s.class_name = ?`, [className]);
    return rows[0] || null;
  }

  // ── COMPONENTS ──────────────────────────────────────────

  async getAllComponents(filters?: {
    type?: string; sub_type?: string; size?: string; grade?: string;
    manufacturer?: string; search?: string;
    sort?: string; order?: string; page?: number; limit?: number;
  }): Promise<PaginatedResult> {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.type) { where.push("c.type = ?"); params.push(filters.type); }
    if (filters?.sub_type) { where.push("c.sub_type = ?"); params.push(filters.sub_type); }
    if (filters?.size) { where.push("c.size = ?"); params.push(parseInt(filters.size)); }
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

  async getShipFilters(): Promise<{ roles: string[]; careers: string[] }> {
    const [roleRows] = await this.pool.execute<Row[]>("SELECT DISTINCT role FROM ships WHERE role IS NOT NULL AND role != '' ORDER BY role");
    const [careerRows] = await this.pool.execute<Row[]>("SELECT DISTINCT career FROM ships WHERE career IS NOT NULL AND career != '' ORDER BY career");
    return {
      roles: roleRows.map((r) => String(r.role)),
      careers: careerRows.map((r) => String(r.career)),
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
    const [rows] = await this.pool.execute<Row[]>("SELECT * FROM ship_modules WHERE ship_uuid = ? ORDER BY slot_name", [shipUuid]);
    return rows;
  }

  async getShipPaints(shipUuid: string): Promise<Row[]> {
    const [rows] = await this.pool.execute<Row[]>(
      "SELECT paint_class_name, paint_name, paint_uuid FROM ship_paints WHERE ship_uuid = ? ORDER BY paint_name",
      [shipUuid],
    );
    return rows;
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

  // ── LOADOUT CALCULATOR ──────────────────────────────────

  async calculateLoadout(shipUuid: string, swaps: { portName: string; componentUuid: string }[]): Promise<Record<string, unknown>> {
    // 1. Load ship
    const [shipRows] = await this.pool.execute<Row[]>("SELECT * FROM ships WHERE uuid = ?", [shipUuid]);
    if (!shipRows.length) throw new Error("Ship not found");
    const ship = shipRows[0];

    // 2. Cross-section fallback from ship_matrix
    let crossX = num(ship.cross_section_x), crossY = num(ship.cross_section_y), crossZ = num(ship.cross_section_z);
    if (crossX === 0 && crossY === 0 && crossZ === 0 && ship.ship_matrix_id) {
      const [smRows] = await this.pool.execute<Row[]>("SELECT length, beam, height FROM ship_matrix WHERE id = ?", [ship.ship_matrix_id]);
      if (smRows.length) { crossX = num(smRows[0].length); crossY = num(smRows[0].beam); crossZ = num(smRows[0].height); }
    }

    // 3. Load loadout with components
    const [loadoutRows] = await this.pool.execute<Row[]>(
      `SELECT sl.port_name, sl.port_type, sl.port_min_size, sl.port_max_size, sl.component_uuid, c.*
       FROM ships_loadouts sl LEFT JOIN components c ON sl.component_uuid = c.uuid WHERE sl.ship_uuid = ?`,
      [shipUuid],
    );
    const loadout: Row[] = loadoutRows.map((row) => ({ ...row }) as Row);

    // 4. Apply swaps — batch load all swapped components (instead of N+1 queries)
    if (swaps.length) {
      const swapMap = new Map(swaps.map(s => [s.portName, s.componentUuid]));
      const swapUuids = [...new Set(swaps.map(s => s.componentUuid))];
      const swapComponents = new Map<string, Row>();

      if (swapUuids.length) {
        const ph = swapUuids.map(() => "?").join(",");
        const [compRows] = await this.pool.execute<Row[]>(`SELECT * FROM components WHERE uuid IN (${ph})`, swapUuids);
        for (const c of compRows) swapComponents.set(c.uuid, c);
      }

      for (const l of loadout) {
        const newUuid = swapMap.get(l.port_name);
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

    // 5. Aggregate stats
    const stats = this.aggregateLoadoutStats(loadout, ship, crossX, crossY, crossZ);

    // 6. Build filtered loadout list
    const filteredLoadout = loadout
      .filter((l) => {
        if (!l.component_uuid || !l.type) return false;
        if (!RELEVANT_TYPES.has(String(l.type))) return false;
        if (String(l.port_name)?.includes("controller") || l.port_name === "Radar" || String(l.port_name)?.endsWith("_helper")) return false;
        if (l.type === "WeaponGun" && (UTILITY_WEAPON_RX.test(String(l.name || l.class_name || "")) || !(num(l.weapon_dps) > 0))) return false;
        return true;
      })
      .map((l) => ({
        port_name: l.port_name, port_type: l.port_type, component_uuid: l.component_uuid,
        component_name: l.name, display_name: cleanName(l.name, l.type),
        component_type: l.type, component_size: int(l.size) || null,
        grade: l.grade || null, manufacturer_code: l.manufacturer_code || null,
        ...(l.type === "WeaponGun" && { weapon_dps: num(l.weapon_dps) || null, weapon_range: num(l.weapon_range) || null }),
        ...(l.type === "Shield" && { shield_hp: num(l.shield_hp) || null, shield_regen: num(l.shield_regen) || null }),
        ...(l.type === "PowerPlant" && { power_output: num(l.power_output) || null }),
        ...(l.type === "Cooler" && { cooling_rate: num(l.cooling_rate) || null }),
        ...(l.type === "QuantumDrive" && { qd_speed: num(l.qd_speed) || null }),
        ...(l.type === "Countermeasure" && { cm_ammo: int(l.cm_ammo_count) || null }),
        ...(l.type === "Radar" && { radar_range: num(l.radar_range) || null }),
        ...(l.type === "EMP" && { emp_damage: num(l.emp_damage) || null, emp_radius: num(l.emp_radius) || null }),
        ...(l.type === "QuantumInterdictionGenerator" && { qig_jammer_range: num(l.qig_jammer_range) || null, qig_snare_radius: num(l.qig_snare_radius) || null }),
        swapped: !!l._swapped,
      }));

    return {
      ship: { uuid: ship.uuid, name: ship.name, class_name: ship.class_name },
      swaps: swaps.length,
      stats,
      loadout: filteredLoadout,
    };
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
    let cmFlare = 0, cmChaff = 0;

    for (const l of loadout) {
      if (!l.component_uuid) continue;

      if (l.type === "WeaponGun") {
        if (UTILITY_WEAPON_RX.test(l.name || "") || UTILITY_WEAPON_RX.test(l.class_name || "")) continue;
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
