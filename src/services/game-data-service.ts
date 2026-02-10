/**
 * GameDataService - Extracts all game data from P4K/DataForge and saves to DB
 *
 * Pipeline:  DataForgeService (binary parser) → GameDataService (DB writer)
 *
 * Populates:
 *   manufacturers          → unique manufacturer codes from ships + components
 *   ships                  → full ship data from DataForge entities
 *   components             → all SCItem components (weapons, shields, QD, etc.)
 *   ships_loadouts → default loadout ports per ship
 */
import type { Pool, PoolConnection } from "mysql2/promise";
import { logger } from "../utils/index.js";
import { DataForgeService, MANUFACTURER_CODES, classifyPort } from "./dataforge-service.js";

export interface ExtractionStats {
  manufacturers: number;
  ships: number;
  components: number;
  loadoutPorts: number;
  shipMatrixLinked: number;
  errors: string[];
}

export class GameDataService {
  constructor(
    private pool: Pool,
    private dfService: DataForgeService,
  ) {}

  // ======================================================
  //  FULL EXTRACTION PIPELINE
  // ======================================================

  async extractAll(onProgress?: (msg: string) => void): Promise<ExtractionStats> {
    const stats: ExtractionStats = {
      manufacturers: 0,
      ships: 0,
      components: 0,
      loadoutPorts: 0,
      shipMatrixLinked: 0,
      errors: [],
    };

    // 1. Load DataForge if needed
    if (!this.dfService.isDataForgeLoaded()) {
      onProgress?.("Loading DataForge…");
      const info = await this.dfService.loadDataForge(onProgress);
      onProgress?.(`DataForge loaded: ${info.vehicleCount} vehicles, v${info.version}`);
    }

    const conn = await this.pool.getConnection();
    try {
      // 2. Collect & save manufacturers FIRST (before ships, due to FK constraint)
      onProgress?.("Saving manufacturers…");
      stats.manufacturers = await this.saveManufacturersFromData(conn);

      // 3. Extract & save components
      onProgress?.("Extracting components…");
      stats.components = await this.saveComponents(conn, onProgress);

      // 4. Extract & save ships + loadouts
      onProgress?.("Extracting ships…");
      const shipResult = await this.saveShips(conn, onProgress);
      stats.ships = shipResult.ships;
      stats.loadoutPorts = shipResult.loadoutPorts;

      // 5. Cross-reference with ship_matrix
      onProgress?.("Cross-referencing with Ship Matrix…");
      stats.shipMatrixLinked = await this.crossReferenceShipMatrix(conn);

      onProgress?.(`✅ Extraction complete: ${stats.ships} ships, ${stats.components} components, ${stats.manufacturers} manufacturers, ${stats.loadoutPorts} loadout ports, ${stats.shipMatrixLinked} linked to Ship Matrix`);
    } finally {
      conn.release();
    }

    return stats;
  }

  // ======================================================
  //  COMPONENTS → components table
  // ======================================================

  private async saveComponents(conn: PoolConnection, onProgress?: (msg: string) => void): Promise<number> {
    const components = this.dfService.extractAllComponents();
    if (!components.length) return 0;

    let saved = 0;
    for (const c of components) {
      try {
        await conn.execute(
          `INSERT INTO components (
            uuid, class_name, name, type, sub_type, size, grade, manufacturer_code,
            mass, hp,
            power_draw, power_base, power_output,
            heat_generation, cooling_rate,
            em_signature, ir_signature,
            weapon_damage, weapon_damage_type, weapon_fire_rate, weapon_range, weapon_speed,
            weapon_ammo_count, weapon_pellets_per_shot, weapon_burst_size,
            weapon_alpha_damage, weapon_dps,
            shield_hp, shield_regen, shield_regen_delay, shield_hardening, shield_faces,
            qd_speed, qd_spool_time, qd_cooldown, qd_fuel_rate, qd_range,
            qd_stage1_accel, qd_stage2_accel,
            missile_damage, missile_signal_type, missile_lock_time, missile_speed,
            missile_range, missile_lock_range
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?,
            ?, ?, ?,
            ?, ?,
            ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?,
            ?, ?, ?, ?,
            ?, ?
          ) ON DUPLICATE KEY UPDATE
            class_name=VALUES(class_name), name=VALUES(name), type=VALUES(type),
            sub_type=VALUES(sub_type), size=VALUES(size), grade=VALUES(grade),
            manufacturer_code=VALUES(manufacturer_code),
            mass=VALUES(mass), hp=VALUES(hp),
            power_draw=VALUES(power_draw), power_base=VALUES(power_base), power_output=VALUES(power_output),
            heat_generation=VALUES(heat_generation), cooling_rate=VALUES(cooling_rate),
            weapon_damage=VALUES(weapon_damage), weapon_damage_type=VALUES(weapon_damage_type),
            weapon_fire_rate=VALUES(weapon_fire_rate), weapon_range=VALUES(weapon_range),
            weapon_speed=VALUES(weapon_speed), weapon_ammo_count=VALUES(weapon_ammo_count),
            weapon_pellets_per_shot=VALUES(weapon_pellets_per_shot), weapon_burst_size=VALUES(weapon_burst_size),
            weapon_alpha_damage=VALUES(weapon_alpha_damage), weapon_dps=VALUES(weapon_dps),
            shield_hp=VALUES(shield_hp), shield_regen=VALUES(shield_regen),
            shield_regen_delay=VALUES(shield_regen_delay), shield_hardening=VALUES(shield_hardening),
            shield_faces=VALUES(shield_faces),
            qd_speed=VALUES(qd_speed), qd_spool_time=VALUES(qd_spool_time),
            qd_cooldown=VALUES(qd_cooldown), qd_fuel_rate=VALUES(qd_fuel_rate),
            qd_range=VALUES(qd_range), qd_stage1_accel=VALUES(qd_stage1_accel),
            qd_stage2_accel=VALUES(qd_stage2_accel),
            missile_damage=VALUES(missile_damage), missile_signal_type=VALUES(missile_signal_type),
            missile_lock_time=VALUES(missile_lock_time), missile_speed=VALUES(missile_speed),
            missile_range=VALUES(missile_range), missile_lock_range=VALUES(missile_lock_range),
            updated_at=CURRENT_TIMESTAMP`,
          [
            c.uuid, c.className, c.name, c.type,
            c.subType || null, c.size ?? null, c.grade || null, c.manufacturerCode || null,
            c.mass ?? null, c.hp ?? null,
            c.powerDraw ?? null, c.powerBase ?? null, c.powerOutput ?? null,
            c.heatGeneration ?? null, c.coolingRate ?? null,
            c.emSignature ?? null, c.irSignature ?? null,
            c.weaponDamage ?? null, c.weaponDamageType || null,
            c.weaponFireRate ?? null, c.weaponRange ?? null, c.weaponSpeed ?? null,
            c.weaponAmmoCount ?? null, c.weaponPelletsPerShot ?? 1, c.weaponBurstSize ?? null,
            c.weaponAlphaDamage ?? null, c.weaponDps ?? null,
            c.shieldHp ?? null, c.shieldRegen ?? null,
            c.shieldRegenDelay ?? null, c.shieldHardening ?? null, c.shieldFaces ?? null,
            c.qdSpeed ?? null, c.qdSpoolTime ?? null,
            c.qdCooldown ?? null, c.qdFuelRate ?? null, c.qdRange ?? null,
            c.qdStage1Accel ?? null, c.qdStage2Accel ?? null,
            c.missileDamage ?? null, c.missileSignalType || null,
            c.missileLockTime ?? null, c.missileSpeed ?? null,
            c.missileRange ?? null, c.missileLockRange ?? null,
          ],
        );
        saved++;
      } catch (e: any) {
        logger.error(`[GameData] Component ${c.className}: ${e.message}`);
      }
    }

    onProgress?.(`Components: ${saved}/${components.length}`);
    return saved;
  }

  // ======================================================
  //  SHIPS → ships + ships_loadouts tables
  // ======================================================

  private async saveShips(
    conn: PoolConnection,
    onProgress?: (msg: string) => void,
  ): Promise<{ ships: number; loadoutPorts: number }> {
    const vehicles = this.dfService.getVehicleDefinitions();
    let savedShips = 0;
    let totalPorts = 0;

    for (const [, veh] of vehicles) {
      try {
        const fullData = await this.dfService.extractFullShipData(veh.className);
        if (!fullData) continue;

        // Determine manufacturer code from className prefix
        const mfgMatch = veh.className.match(/^([A-Z]{3,5})_/);
        const mfgCode = mfgMatch?.[1] || null;

        await conn.execute(
          `INSERT INTO ships (
            uuid, class_name, name, manufacturer_code,
            role, career, dog_fight_enabled, crew_size, vehicle_definition,
            size_x, size_y, size_z,
            mass, scm_speed, max_speed, total_hp,
            hydrogen_fuel_capacity, quantum_fuel_capacity,
            shield_hp,
            insurance_claim_time, insurance_expedite_cost,
            game_data
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            class_name=VALUES(class_name), name=VALUES(name),
            manufacturer_code=VALUES(manufacturer_code),
            role=VALUES(role), career=VALUES(career),
            dog_fight_enabled=VALUES(dog_fight_enabled), crew_size=VALUES(crew_size),
            vehicle_definition=VALUES(vehicle_definition),
            size_x=VALUES(size_x), size_y=VALUES(size_y), size_z=VALUES(size_z),
            mass=VALUES(mass), scm_speed=VALUES(scm_speed), max_speed=VALUES(max_speed),
            total_hp=VALUES(total_hp),
            hydrogen_fuel_capacity=VALUES(hydrogen_fuel_capacity),
            quantum_fuel_capacity=VALUES(quantum_fuel_capacity),
            shield_hp=VALUES(shield_hp),
            insurance_claim_time=VALUES(insurance_claim_time),
            insurance_expedite_cost=VALUES(insurance_expedite_cost),
            game_data=VALUES(game_data),
            extracted_at=CURRENT_TIMESTAMP`,
          [
            fullData.ref,                                       // uuid
            veh.className,                                      // class_name
            fullData.name || veh.name,                          // name
            mfgCode,                                            // manufacturer_code
            fullData.vehicle?.role || null,                     // role
            fullData.vehicle?.career || null,                   // career
            fullData.vehicle?.dogfightEnabled ?? true,          // dog_fight_enabled
            fullData.vehicle?.crewSize || 1,                    // crew_size
            fullData.vehicle?.vehicleDefinition || veh.className, // vehicle_definition
            fullData.vehicle?.size?.x || null,                  // size_x
            fullData.vehicle?.size?.y || null,                  // size_y
            fullData.vehicle?.size?.z || null,                  // size_z
            fullData.hull?.mass || null,                        // mass
            fullData.ifcs?.scmSpeed || null,                    // scm_speed
            fullData.ifcs?.maxSpeed || null,                    // max_speed
            fullData.hull?.totalHp || null,                     // total_hp
            fullData.fuelCapacity || null,                      // hydrogen_fuel_capacity
            fullData.qtFuelCapacity || null,                    // quantum_fuel_capacity
            fullData.shield?.maxHp || fullData.shield?.hp || null, // shield_hp
            fullData.insurance?.baseWaitTimeMinutes || null,    // insurance_claim_time
            fullData.insurance?.baseExpeditingFee || null,      // insurance_expedite_cost
            JSON.stringify(fullData),                           // game_data
          ],
        );
        savedShips++;

        // Extract & save loadout
        const loadout = this.dfService.extractVehicleLoadout(veh.className);
        if (loadout && loadout.length > 0) {
          // Delete old loadout first (idempotent)
          await conn.execute("DELETE FROM ships_loadouts WHERE ship_uuid = ?", [fullData.ref]);
          totalPorts += await this.saveLoadout(conn, fullData.ref, loadout);
        }

        if (savedShips % 20 === 0) onProgress?.(`Ships: ${savedShips}/${vehicles.size}…`);
      } catch (e: any) {
        logger.error(`[GameData] Ship ${veh.className}: ${e.message}`);
      }
    }

    onProgress?.(`Ships: ${savedShips}/${vehicles.size}`);
    return { ships: savedShips, loadoutPorts: totalPorts };
  }

  private async saveLoadout(
    conn: PoolConnection,
    shipUuid: string,
    loadout: Array<{
      portName: string;
      portType?: string;
      componentClassName?: string;
      children?: Array<{ portName: string; componentClassName?: string }>;
    }>,
  ): Promise<number> {
    let count = 0;

    for (const port of loadout) {
      try {
        // Resolve component UUID from class name
        const compUuid = port.componentClassName
          ? await this.resolveComponentUuid(conn, port.componentClassName)
          : null;

        const [result] = await conn.execute<any>(
          `INSERT INTO ships_loadouts
            (ship_uuid, port_name, port_type, component_class_name, component_uuid)
           VALUES (?, ?, ?, ?, ?)`,
          [
            shipUuid,
            port.portName,
            port.portType || null,
            port.componentClassName || null,
            compUuid,
          ],
        );
        const parentId = result.insertId;
        count++;

        // Save children (sub-ports on turrets, missile racks, etc.)
        if (port.children && port.children.length > 0) {
          for (const child of port.children) {
            const childCompUuid = child.componentClassName
              ? await this.resolveComponentUuid(conn, child.componentClassName)
              : null;

            await conn.execute(
              `INSERT INTO ships_loadouts
                (ship_uuid, port_name, port_type, component_class_name, component_uuid, parent_id)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [
                shipUuid,
                child.portName,
                classifyPort(child.portName, child.componentClassName || ""),
                child.componentClassName || null,
                childCompUuid,
                parentId,
              ],
            );
            count++;
          }
        }
      } catch (e: any) {
        logger.error(`[GameData] Loadout port ${port.portName}: ${e.message}`);
      }
    }
    return count;
  }

  private async resolveComponentUuid(conn: PoolConnection, className: string): Promise<string | null> {
    try {
      const [rows] = await conn.execute<any[]>(
        "SELECT uuid FROM components WHERE class_name = ? LIMIT 1",
        [className],
      );
      return rows[0]?.uuid || null;
    } catch {
      return null;
    }
  }

  // ======================================================
  //  MANUFACTURERS → manufacturers table
  //  Called BEFORE ships (FK constraint) - collects codes from in-memory data
  // ======================================================

  private async saveManufacturersFromData(conn: PoolConnection): Promise<number> {
    const codes = new Set<string>();

    // Collect from vehicle definitions (className prefix)
    const vehicles = this.dfService.getVehicleDefinitions();
    for (const [, veh] of vehicles) {
      const m = veh.className.match(/^([A-Z]{3,5})_/);
      if (m) codes.add(m[1]);
    }

    // Collect from all components (extractAllComponents is synchronous and returns in-memory data)
    const components = this.dfService.extractAllComponents();
    for (const c of components) {
      if (c.manufacturerCode) codes.add(c.manufacturerCode);
    }

    // Also add all hardcoded codes from MANUFACTURER_CODES
    for (const code of Object.keys(MANUFACTURER_CODES)) {
      codes.add(code);
    }

    let saved = 0;
    for (const code of codes) {
      const name = MANUFACTURER_CODES[code] || code;
      try {
        await conn.execute(
          `INSERT INTO manufacturers (code, name)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE name=VALUES(name)`,
          [code, name],
        );
        saved++;
      } catch (e: any) {
        logger.error(`[GameData] Manufacturer ${code}: ${e.message}`);
      }
    }
    return saved;
  }

  // ======================================================
  //  CROSS-REFERENCE ships ↔ ship_matrix
  // ======================================================

  /**
   * Known name aliases: Ship Matrix name → P4K name.
   * Keys and values are raw — normalization happens at lookup time.
   */
  private static readonly SM_TO_P4K_ALIASES: Record<string, string> = {
    // Crusader renames
    "Mercury": "Star Runner",
    "Ares Inferno": "Starfighter Inferno",
    "Ares Ion": "Starfighter Ion",
    "A2 Hercules": "Starlifter A2",
    "C2 Hercules": "Starlifter C2",
    "M2 Hercules": "Starlifter M2",
    "Genesis": "Starliner Genesis",
    "A1 Spirit": "Spirit A1",
    "C1 Spirit": "Spirit C1",
    "E1 Spirit": "Spirit E1",
    // Hornet reformatting
    "F7A Hornet Mk I": "Hornet F7A Mk1",
    "F7A Hornet Mk II": "Hornet F7A Mk2",
    "F7C Hornet Mk I": "Hornet F7C",
    "F7C Hornet Mk II": "Hornet F7C Mk2",
    "F7C Hornet Wildfire Mk I": "Hornet F7C Wildfire",
    "F7C-R Hornet Tracker Mk I": "Hornet F7CR",
    "F7C-R Hornet Tracker Mk II": "Hornet F7CR Mk2",
    "F7C-S Hornet Ghost Mk I": "Hornet F7CS",
    "F7C-S Hornet Ghost Mk II": "Hornet F7CS Mk2",
    "F7C-M Super Hornet Mk I": "Hornet F7CM",
    "F7C-M Super Hornet Heartseeker Mk I": "Hornet F7CM Heartseeker",
    "F7C-M Super Hornet Mk II": "Hornet F7CM Mk2",
    // F8C Lightning
    "F8C Lightning": "Lightning F8C",
    "F8C Lightning Executive Edition": "Lightning F8C Exec",
    // Kruger
    "P-52 Merlin": "P52 Merlin",
    "P-72 Archimedes": "P72 Archimedes",
    "P-72 Archimedes Emerald": "P72 Archimedes Emerald",
    // MISC
    "Reliant Kore": "Reliant",
    "Expanse": "Starlancer Max",
    // Origin
    "890 Jump": "890Jump",
    "600i Explorer": "600i",
    "600i Touring": "600i Touring",
    // ARGO
    "MPUV Cargo": "MPUV 1T",
    "MPUV Personnel": "MPUV Transport",
    "MPUV Tractor": "MPUV",
    // Drake
    "Dragonfly Black": "Dragonfly",
    "Dragonfly Yellowjacket": "Dragonfly Yellow",
    // Editions / variants
    "Mustang Alpha Vindicator": "Mustang Alpha",
    "Gladius Pirate Edition": "Gladius PIR",
    "Caterpillar Pirate Edition": "Caterpillar Pirate",
    "Caterpillar Best In Show Edition 2949": "Caterpillar BIS2949",
    "Cutlass Black Best In Show Edition 2949": "Cutlass Black BIS2949",
    "Hammerhead Best In Show Edition 2949": "Hammerhead BIS2949",
    "Reclaimer Best In Show Edition 2949": "Reclaimer BIS2949",
    "Valkyrie Liberator Edition": "Valkyrie Liberator",
    "Argo Mole Carbon Edition": "MOLE Carbon",
    "Argo Mole Talus Edition": "MOLE Talus",
    "Nautilus Solstice Edition": "Nautilus Solstice",
    "Carrack w/C8X": "Carrack",
    "Carrack Expedition w/C8X": "Carrack Expedition",
    "Anvil Ballista Dunestalker": "Ballista Dunestalker",
    "Anvil Ballista Snowblind": "Ballista Snowblind",
    // Nox / Aopoa (XNAA → XIAN in P4K)
    "Nox": "Nox",
    "Nox Kue": "Nox Kue",
    "Khartu-Al": "Khartu Al",
    "San'tok.y\u0101i": "Scout",
    // Zeus
    "Zeus Mk II CL": "Zeus CL",
    "Zeus Mk II ES": "Zeus ES",
    "Zeus Mk II MR": "Zeus MR",
    // Vanguard
    "Vanguard Warden": "Vanguard",
    // Ground vehicles
    "Ursa": "Ursa Rover",
    "Ursa Fortuna": "Ursa Rover Emerald",
    "ROC-DS": "ROC DS",
    // Kruger wolves
    "L-21 Wolf": "L21 Wolf",
    "L-22 Alpha Wolf": "L22 AlphaWolf",
  };

  private normalizeForMatch(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")  // strip accents (ā→a, â→a, etc.)
      .replace(/['\u2019\u2018]/g, "'") // normalize quotes
      .replace(/-/g, " ")
      .replace(/\./g, "")
      .replace(/\//g, "")
      .replace(/\s+/g, " ");
  }

  private async crossReferenceShipMatrix(conn: PoolConnection): Promise<number> {
    // Reset all previous links
    await conn.execute("UPDATE ships SET ship_matrix_id = NULL WHERE ship_matrix_id IS NOT NULL");

    const [ships] = await conn.execute<any[]>(
      "SELECT uuid, class_name, name FROM ships",
    );
    const [smEntries] = await conn.execute<any[]>(
      "SELECT id, name FROM ship_matrix",
    );

    // Build normalized alias map
    const aliasMap = new Map<string, string>();
    for (const [smName, p4kName] of Object.entries(GameDataService.SM_TO_P4K_ALIASES)) {
      aliasMap.set(this.normalizeForMatch(smName), this.normalizeForMatch(p4kName));
    }

    // Build P4K lookup maps
    const p4kByName = new Map<string, string>();
    const p4kByClassName = new Map<string, string>();
    for (const ship of ships) {
      const norm = this.normalizeForMatch(ship.name || "");
      if (norm && !p4kByName.has(norm)) p4kByName.set(norm, ship.uuid);
      const short = this.normalizeForMatch(
        ship.class_name.replace(/^[A-Z]{3,5}_/, "").replace(/_/g, " ")
      );
      if (short && !p4kByClassName.has(short)) p4kByClassName.set(short, ship.uuid);
    }

    // Track matched ships to avoid overwriting
    const matchedP4K = new Set<string>();
    const matchedSM = new Set<number>();
    const results: Array<{ smId: number; uuid: string }> = [];

    const tryMatch = (smId: number, strategies: Array<() => string | undefined>) => {
      if (matchedSM.has(smId)) return;
      for (const strategy of strategies) {
        const uuid = strategy();
        if (uuid && !matchedP4K.has(uuid)) {
          matchedP4K.add(uuid);
          matchedSM.add(smId);
          results.push({ smId, uuid });
          return;
        }
      }
    };

    // Pass 1: Exact name matches (highest priority)
    for (const sm of smEntries) {
      const smNorm = this.normalizeForMatch(sm.name);
      tryMatch(sm.id, [() => p4kByName.get(smNorm)]);
    }

    // Pass 2: Alias + class_name matches
    for (const sm of smEntries) {
      const smNorm = this.normalizeForMatch(sm.name);
      tryMatch(sm.id, [
        () => {
          const alias = aliasMap.get(smNorm);
          return alias ? (p4kByName.get(alias) || p4kByClassName.get(alias)) : undefined;
        },
        () => p4kByClassName.get(smNorm),
        () => {
          const stripped = smNorm.replace(/^(anvil|argo|crusader|drake)\s+/, "");
          return stripped !== smNorm ? (p4kByName.get(stripped) || p4kByClassName.get(stripped)) : undefined;
        },
      ]);
    }

    // Pass 3: Token-based fuzzy matching
    for (const sm of smEntries) {
      if (matchedSM.has(sm.id)) continue;
      const smNorm = this.normalizeForMatch(sm.name);
      const smTokens = new Set(smNorm.split(" ").filter(t => t.length > 1));
      if (smTokens.size < 2) continue;

      let bestScore = 0;
      let bestUuid: string | undefined;
      for (const ship of ships) {
        if (matchedP4K.has(ship.uuid)) continue;
        const p4kNorm = this.normalizeForMatch(ship.name || "");
        const p4kTokens = new Set(p4kNorm.split(" ").filter(t => t.length > 1));
        let hits = 0;
        for (const t of smTokens) if (p4kTokens.has(t)) hits++;
        const score = hits / smTokens.size;
        if (hits >= 2 && score > bestScore && score >= 0.6) {
          bestScore = score;
          bestUuid = ship.uuid;
        }
      }
      if (bestUuid) {
        matchedP4K.add(bestUuid);
        matchedSM.add(sm.id);
        results.push({ smId: sm.id, uuid: bestUuid });
      }
    }

    // Apply all matches
    for (const { smId, uuid } of results) {
      await conn.execute("UPDATE ships SET ship_matrix_id = ? WHERE uuid = ?", [smId, uuid]);
    }

    return results.length;
  }

  // ======================================================
  //  QUERY METHODS (used by routes)
  // ======================================================

  async getAllShips(filters?: {
    manufacturer?: string;
    role?: string;
    search?: string;
    sort?: string;
    order?: string;
  }): Promise<any[]> {
    let sql = "SELECT * FROM ships WHERE 1=1";
    const params: any[] = [];

    if (filters?.manufacturer) {
      sql += " AND manufacturer_code = ?";
      params.push(filters.manufacturer.toUpperCase());
    }
    if (filters?.role) {
      sql += " AND role LIKE ?";
      params.push(`%${filters.role}%`);
    }
    if (filters?.search) {
      sql += " AND (name LIKE ? OR class_name LIKE ?)";
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    const sortCol = this.validateSortColumn(filters?.sort || "name");
    const order = filters?.order?.toUpperCase() === "DESC" ? "DESC" : "ASC";
    sql += ` ORDER BY ${sortCol} ${order}`;

    const [rows] = await this.pool.execute(sql, params);
    return rows as any[];
  }

  async getShipByUuid(uuid: string): Promise<any | null> {
    const [rows] = await this.pool.execute<any[]>(
      "SELECT * FROM ships WHERE uuid = ?",
      [uuid],
    );
    return rows[0] || null;
  }

  async getShipByClassName(className: string): Promise<any | null> {
    const [rows] = await this.pool.execute<any[]>(
      "SELECT * FROM ships WHERE class_name = ?",
      [className],
    );
    return rows[0] || null;
  }

  async getAllComponents(filters?: {
    type?: string;
    size?: string;
    manufacturer?: string;
    search?: string;
    sort?: string;
    order?: string;
  }): Promise<any[]> {
    let sql = "SELECT * FROM components WHERE 1=1";
    const params: any[] = [];

    if (filters?.type) {
      sql += " AND type = ?";
      params.push(filters.type);
    }
    if (filters?.size) {
      sql += " AND size = ?";
      params.push(parseInt(filters.size));
    }
    if (filters?.manufacturer) {
      sql += " AND manufacturer_code = ?";
      params.push(filters.manufacturer.toUpperCase());
    }
    if (filters?.search) {
      sql += " AND (name LIKE ? OR class_name LIKE ?)";
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    const sortCol = this.validateComponentSortColumn(filters?.sort || "name");
    const order = filters?.order?.toUpperCase() === "DESC" ? "DESC" : "ASC";
    sql += ` ORDER BY ${sortCol} ${order}`;

    const [rows] = await this.pool.execute(sql, params);
    return rows as any[];
  }

  async getComponentByUuid(uuid: string): Promise<any | null> {
    const [rows] = await this.pool.execute<any[]>(
      "SELECT * FROM components WHERE uuid = ?",
      [uuid],
    );
    return rows[0] || null;
  }

  async getAllManufacturers(): Promise<any[]> {
    const [rows] = await this.pool.execute("SELECT * FROM manufacturers ORDER BY code");
    return rows as any[];
  }

  async getShipLoadout(shipUuid: string): Promise<any[]> {
    const [rows] = await this.pool.execute(
      `SELECT l.*, c.name as component_name, c.type as component_type, c.size as component_size
       FROM ships_loadouts l
       LEFT JOIN components c ON l.component_uuid = c.uuid
       WHERE l.ship_uuid = ?
       ORDER BY l.parent_id IS NULL DESC, l.port_type, l.port_name`,
      [shipUuid],
    );
    return rows as any[];
  }

  async getStats(): Promise<any> {
    const [ships] = await this.pool.execute<any[]>("SELECT COUNT(*) as count FROM ships");
    const [components] = await this.pool.execute<any[]>("SELECT COUNT(*) as count FROM components");
    const [manufacturers] = await this.pool.execute<any[]>("SELECT COUNT(*) as count FROM manufacturers");
    const [loadouts] = await this.pool.execute<any[]>("SELECT COUNT(*) as count FROM ships_loadouts");
    const [linked] = await this.pool.execute<any[]>("SELECT COUNT(*) as count FROM ships WHERE ship_matrix_id IS NOT NULL");

    return {
      ships: ships[0].count,
      components: components[0].count,
      manufacturers: manufacturers[0].count,
      loadoutPorts: loadouts[0].count,
      shipsLinkedToMatrix: linked[0].count,
    };
  }

  // ======================================================
  //  HELPERS
  // ======================================================

  private validateSortColumn(col: string): string {
    const allowed = ["name", "class_name", "manufacturer_code", "mass", "scm_speed", "max_speed", "total_hp", "shield_hp", "crew_size"];
    return allowed.includes(col) ? col : "name";
  }

  private validateComponentSortColumn(col: string): string {
    const allowed = ["name", "class_name", "type", "size", "grade", "manufacturer_code", "weapon_dps", "shield_hp", "qd_speed"];
    return allowed.includes(col) ? col : "name";
  }
}
