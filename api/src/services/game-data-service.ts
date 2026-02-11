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
import { createHash } from "crypto";
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
  extractionHash?: string;
  durationMs?: number;
}

export class GameDataService {
  constructor(
    private pool: Pool,
    public dfService: DataForgeService,
  ) {}

  // ======================================================
  //  FULL EXTRACTION PIPELINE
  // ======================================================

  async extractAll(onProgress?: (msg: string) => void): Promise<ExtractionStats> {
    const startTime = Date.now();
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

    // Compute extraction hash from DataForge metadata
    const extractionHash = createHash('sha256')
      .update(`${this.dfService.getVersion?.() || 'unknown'}-${Date.now()}`)
      .digest('hex');
    stats.extractionHash = extractionHash;

    const conn = await this.pool.getConnection();
    try {
      // 1b. Clean stale data before fresh extraction (order matters for FK constraints)
      onProgress?.("Cleaning stale data…");
      await conn.execute("DELETE FROM shop_inventory");
      await conn.execute("DELETE FROM shops");
      await conn.execute("DELETE FROM ship_modules");
      await conn.execute("DELETE FROM ships_loadouts");
      await conn.execute("DELETE FROM ships");
      await conn.execute("DELETE FROM components");
      await conn.execute("DELETE FROM changelog WHERE 1=1");
      // Note: manufacturers and ship_matrix are NOT cleaned (they persist across extractions)

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

      // 5. Extract & save shops/vendors
      onProgress?.("Extracting shops & prices…");
      const shopResult = await this.saveShopsData(conn, onProgress);

      // 6. Cross-reference with ship_matrix
      onProgress?.("Cross-referencing with Ship Matrix…");
      stats.shipMatrixLinked = await this.crossReferenceShipMatrix(conn);

      // 6. Log extraction to extraction_log
      stats.durationMs = Date.now() - startTime;
      try {
        await conn.execute(
          `INSERT INTO extraction_log (extraction_hash, game_version, ships_count, components_count, manufacturers_count, loadout_ports_count, duration_ms, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [extractionHash, this.dfService.getVersion?.() || null, stats.ships, stats.components, stats.manufacturers, stats.loadoutPorts, stats.durationMs, 'success']
        );
      } catch (e) { /* extraction_log is non-critical */ }

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
            weapon_damage_physical, weapon_damage_energy, weapon_damage_distortion,
            weapon_damage_thermal, weapon_damage_biochemical, weapon_damage_stun,
            weapon_heat_per_shot, weapon_burst_dps, weapon_sustained_dps,
            shield_hp, shield_regen, shield_regen_delay, shield_hardening, shield_faces,
            qd_speed, qd_spool_time, qd_cooldown, qd_fuel_rate, qd_range,
            qd_stage1_accel, qd_stage2_accel,
            missile_damage, missile_signal_type, missile_lock_time, missile_speed,
            missile_range, missile_lock_range,
            missile_damage_physical, missile_damage_energy, missile_damage_distortion,
            thruster_max_thrust, thruster_type,
            radar_range, cm_ammo_count,
            fuel_capacity, fuel_intake_rate
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?,
            ?, ?, ?,
            ?, ?,
            ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?,
            ?, ?, ?, ?,
            ?, ?,
            ?, ?, ?,
            ?, ?,
            ?, ?,
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
            weapon_damage_physical=VALUES(weapon_damage_physical), weapon_damage_energy=VALUES(weapon_damage_energy),
            weapon_damage_distortion=VALUES(weapon_damage_distortion), weapon_damage_thermal=VALUES(weapon_damage_thermal),
            weapon_damage_biochemical=VALUES(weapon_damage_biochemical), weapon_damage_stun=VALUES(weapon_damage_stun),
            weapon_heat_per_shot=VALUES(weapon_heat_per_shot),
            weapon_burst_dps=VALUES(weapon_burst_dps), weapon_sustained_dps=VALUES(weapon_sustained_dps),
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
            missile_damage_physical=VALUES(missile_damage_physical), missile_damage_energy=VALUES(missile_damage_energy),
            missile_damage_distortion=VALUES(missile_damage_distortion),
            thruster_max_thrust=VALUES(thruster_max_thrust), thruster_type=VALUES(thruster_type),
            radar_range=VALUES(radar_range), cm_ammo_count=VALUES(cm_ammo_count),
            fuel_capacity=VALUES(fuel_capacity), fuel_intake_rate=VALUES(fuel_intake_rate),
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
            c.weaponDamagePhysical ?? null, c.weaponDamageEnergy ?? null, c.weaponDamageDistortion ?? null,
            c.weaponDamageThermal ?? null, c.weaponDamageBiochemical ?? null, c.weaponDamageStun ?? null,
            c.weaponHeatPerShot ?? null, c.weaponBurstDps ?? null, c.weaponSustainedDps ?? null,
            c.shieldHp ?? null, c.shieldRegen ?? null,
            c.shieldRegenDelay ?? null, c.shieldHardening ?? null, c.shieldFaces ?? null,
            c.qdSpeed ?? null, c.qdSpoolTime ?? null,
            c.qdCooldown ?? null, c.qdFuelRate ?? null, c.qdRange ?? null,
            c.qdStage1Accel ?? null, c.qdStage2Accel ?? null,
            c.missileDamage ?? null, c.missileSignalType || null,
            c.missileLockTime ?? null, c.missileSpeed ?? null,
            c.missileRange ?? null, c.missileLockRange ?? null,
            c.missileDamagePhysical ?? null, c.missileDamageEnergy ?? null, c.missileDamageDistortion ?? null,
            c.thrusterMaxThrust ?? null, c.thrusterType || null,
            c.radarRange ?? null, c.cmAmmoCount ?? null,
            c.fuelCapacity ?? null, c.fuelIntakeRate ?? null,
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
    let skippedNonPlayable = 0;

    for (const [, veh] of vehicles) {
      try {
        const fullData = await this.dfService.extractFullShipData(veh.className);
        if (!fullData) continue;

        // === FILTER: only keep playable/flyable ships ===
        const lcName = veh.className.toLowerCase();
        // Skip ammo boxes, test vehicles, debug entities, NPC-only, templates
        if (lcName.startsWith('ambx_') || lcName.includes('_test') || lcName.includes('_debug') ||
            lcName.includes('_template') || lcName.includes('_indestructible') ||
            lcName.includes('_unmanned') || lcName.includes('_npc_only') ||
            lcName.includes('_prison') || lcName.includes('_hijacked') ||
            lcName.includes('_drug') || lcName.includes('_ai_only') ||
            lcName.includes('_derelict') || lcName.includes('_wreck')) {
          skippedNonPlayable++;
          continue;
        }
        // Skip duplicate PU/AI variants (keep base entity only)
        if (/_PU($|_)/i.test(veh.className) || /_AI_/i.test(veh.className)) {
          skippedNonPlayable++;
          continue;
        }

        // Determine manufacturer code from className prefix
        const mfgMatch = veh.className.match(/^([A-Z]{3,5})_/);
        const mfgCode = mfgMatch?.[1] || null;

        await conn.execute(
          `INSERT INTO ships (
            uuid, class_name, name, manufacturer_code,
            role, career, dog_fight_enabled, crew_size, vehicle_definition,
            size_x, size_y, size_z,
            mass, scm_speed, max_speed,
            boost_speed_forward, boost_speed_backward,
            pitch_max, yaw_max, roll_max,
            total_hp,
            hydrogen_fuel_capacity, quantum_fuel_capacity,
            shield_hp,
            armor_physical, armor_energy, armor_distortion,
            armor_thermal, armor_biochemical, armor_stun,
            armor_signal_ir, armor_signal_em, armor_signal_cs,
            cross_section_x, cross_section_y, cross_section_z,
            short_name, description, ship_grade, cargo_capacity,
            insurance_claim_time, insurance_expedite_cost,
            game_data
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            class_name=VALUES(class_name), name=VALUES(name),
            manufacturer_code=VALUES(manufacturer_code),
            role=VALUES(role), career=VALUES(career),
            dog_fight_enabled=VALUES(dog_fight_enabled), crew_size=VALUES(crew_size),
            vehicle_definition=VALUES(vehicle_definition),
            size_x=VALUES(size_x), size_y=VALUES(size_y), size_z=VALUES(size_z),
            mass=VALUES(mass), scm_speed=VALUES(scm_speed), max_speed=VALUES(max_speed),
            boost_speed_forward=VALUES(boost_speed_forward),
            boost_speed_backward=VALUES(boost_speed_backward),
            pitch_max=VALUES(pitch_max), yaw_max=VALUES(yaw_max), roll_max=VALUES(roll_max),
            total_hp=VALUES(total_hp),
            hydrogen_fuel_capacity=VALUES(hydrogen_fuel_capacity),
            quantum_fuel_capacity=VALUES(quantum_fuel_capacity),
            shield_hp=VALUES(shield_hp),
            armor_physical=VALUES(armor_physical), armor_energy=VALUES(armor_energy),
            armor_distortion=VALUES(armor_distortion), armor_thermal=VALUES(armor_thermal),
            armor_biochemical=VALUES(armor_biochemical), armor_stun=VALUES(armor_stun),
            armor_signal_ir=VALUES(armor_signal_ir), armor_signal_em=VALUES(armor_signal_em),
            armor_signal_cs=VALUES(armor_signal_cs),
            cross_section_x=VALUES(cross_section_x), cross_section_y=VALUES(cross_section_y),
            cross_section_z=VALUES(cross_section_z),
            short_name=VALUES(short_name), description=VALUES(description),
            ship_grade=VALUES(ship_grade), cargo_capacity=VALUES(cargo_capacity),
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
            fullData.ifcs?.boostSpeedForward || null,           // boost_speed_forward
            fullData.ifcs?.boostSpeedBackward || null,          // boost_speed_backward
            fullData.ifcs?.angularVelocity?.x || null,         // pitch_max
            fullData.ifcs?.angularVelocity?.z || null,          // yaw_max
            fullData.ifcs?.angularVelocity?.y || null,          // roll_max
            fullData.hull?.totalHp || null,                     // total_hp
            fullData.fuelCapacity || null,                      // hydrogen_fuel_capacity
            fullData.qtFuelCapacity || null,                    // quantum_fuel_capacity
            fullData.shield?.maxShieldHealth || fullData.shield?.maxHp || null, // shield_hp
            // Armor damage multipliers
            fullData.armor?.data?.armor?.damageMultiplier?.damagePhysical ?? null,
            fullData.armor?.data?.armor?.damageMultiplier?.damageEnergy ?? null,
            fullData.armor?.data?.armor?.damageMultiplier?.damageDistortion ?? null,
            fullData.armor?.data?.armor?.damageMultiplier?.damageThermal ?? null,
            fullData.armor?.data?.armor?.damageMultiplier?.damageBiochemical ?? null,
            fullData.armor?.data?.armor?.damageMultiplier?.damageStun ?? null,
            // Armor signals
            fullData.armor?.data?.armor?.signalIR ?? null,
            fullData.armor?.data?.armor?.signalEM ?? null,
            fullData.armor?.data?.armor?.signalCS ?? null,
            // Cross section
            fullData.crossSection?.x || null,
            fullData.crossSection?.y || null,
            fullData.crossSection?.z || null,
            // Metadata
            fullData.shortName || null,                         // short_name
            fullData.description || null,                       // description
            fullData.grade || null,                             // ship_grade
            fullData.cargo || null,                             // cargo_capacity
            // Insurance
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

        // Detect & save modules (ports named *module* that reference other vehicle entities)
        await this.detectAndSaveModules(conn, fullData, veh.className);

        if (savedShips % 20 === 0) onProgress?.(`Ships: ${savedShips}/${vehicles.size}…`);
      } catch (e: any) {
        logger.error(`[GameData] Ship ${veh.className}: ${e.message}`);
      }
    }

    onProgress?.(`Ships: ${savedShips}/${vehicles.size} (${skippedNonPlayable} non-playable skipped)`);
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

  /**
   * Detect modular compartments in ship data (Retaliator front/rear, Apollo medical, etc.)
   * Modules are typically loadout ports whose componentClassName references another vehicle entity
   * or ports with "module" in their name.
   */
  private async detectAndSaveModules(
    conn: PoolConnection,
    fullData: any,
    shipClassName: string,
  ): Promise<void> {
    if (!fullData?.ref || !fullData?.game_data) return;
    const gameData = typeof fullData.game_data === 'string' ? JSON.parse(fullData.game_data) : fullData;

    // Known module slot patterns in Star Citizen
    const MODULE_PATTERNS = [
      /module/i,
      /compartment/i,
      /bay_section/i,
    ];

    // Scan loadout ports for module-like entries
    const loadout = this.dfService.extractVehicleLoadout(shipClassName);
    if (!loadout) return;

    for (const port of loadout) {
      const isModulePort = MODULE_PATTERNS.some(rx => rx.test(port.portName));
      if (!isModulePort) continue;
      if (!port.componentClassName) continue;

      // Format a human-readable slot name
      const slotDisplay = port.portName
        .replace(/hardpoint_/i, '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());

      // Format module display name from className
      const moduleName = port.componentClassName
        .replace(/^[A-Z]{2,5}_/, '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());

      try {
        await conn.execute(
          `INSERT INTO ship_modules (ship_uuid, slot_name, slot_display_name, module_class_name, module_name, is_default)
           VALUES (?, ?, ?, ?, ?, TRUE)`,
          [fullData.ref, port.portName, slotDisplay, port.componentClassName, moduleName],
        );
      } catch (e: any) {
        logger.error(`[GameData] Module ${port.portName} on ${shipClassName}: ${e.message}`);
      }
    }
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
    // Editions / variants — BIS editions map to base ships (no separate game entity)
    "Mustang Alpha Vindicator": "Mustang Alpha",
    "Gladius Pirate Edition": "Gladius PIR",
    "Caterpillar Pirate Edition": "Caterpillar Pirate",
    "Caterpillar Best In Show Edition 2949": "Caterpillar",
    "Cutlass Black Best In Show Edition 2949": "Cutlass Black",
    "Hammerhead Best In Show Edition 2949": "Hammerhead",
    "Reclaimer Best In Show Edition 2949": "Reclaimer",
    "Valkyrie Liberator Edition": "Valkyrie",
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
    "Khartu-Al": "Scout",
    "San'tok.y\u0101i": "Scout",
    // ARGO CSV
    "CSV-SM": "CSV Cargo",
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
    page?: number;
    limit?: number;
  }): Promise<{ data: any[]; total: number; page: number; limit: number; pages: number }> {
    let sql = "SELECT s.*, m.name as manufacturer_name, sm.media_store_small as thumbnail, sm.media_store_large as thumbnail_large, sm.production_status, sm.description as sm_description, sm.url as store_url FROM ships s LEFT JOIN manufacturers m ON s.manufacturer_code = m.code LEFT JOIN ship_matrix sm ON s.ship_matrix_id = sm.id WHERE 1=1";
    let countSql = "SELECT COUNT(*) as total FROM ships s WHERE 1=1";
    const params: any[] = [];
    const countParams: any[] = [];

    if (filters?.manufacturer) {
      sql += " AND s.manufacturer_code = ?";
      countSql += " AND s.manufacturer_code = ?";
      params.push(filters.manufacturer.toUpperCase());
      countParams.push(filters.manufacturer.toUpperCase());
    }
    if (filters?.role) {
      sql += " AND s.role LIKE ?";
      countSql += " AND s.role LIKE ?";
      params.push(`%${filters.role}%`);
      countParams.push(`%${filters.role}%`);
    }
    if (filters?.search) {
      sql += " AND (s.name LIKE ? OR s.class_name LIKE ?)";
      countSql += " AND (s.name LIKE ? OR s.class_name LIKE ?)";
      params.push(`%${filters.search}%`, `%${filters.search}%`);
      countParams.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    const sortCol = this.validateSortColumn(filters?.sort || "name");
    const order = filters?.order?.toUpperCase() === "DESC" ? "DESC" : "ASC";
    sql += ` ORDER BY s.${sortCol} ${order}`;

    // Pagination — inline LIMIT/OFFSET (prepared stmt driver limitation)
    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(200, Math.max(1, filters?.limit || 50));
    const offset = (page - 1) * limit;
    sql += ` LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;

    const [countRows] = await this.pool.execute(countSql, countParams);
    const total = (countRows as any[])[0]?.total || 0;
    const [rows] = await this.pool.execute(sql, params);
    return { data: rows as any[], total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getShipByUuid(uuid: string): Promise<any | null> {
    const [rows] = await this.pool.execute<any[]>(
      "SELECT s.*, m.name as manufacturer_name, sm.media_store_small as thumbnail, sm.media_store_large as thumbnail_large, sm.production_status, sm.description as sm_description, sm.url as store_url FROM ships s LEFT JOIN manufacturers m ON s.manufacturer_code = m.code LEFT JOIN ship_matrix sm ON s.ship_matrix_id = sm.id WHERE s.uuid = ?",
      [uuid],
    );
    return rows[0] || null;
  }

  async getShipByClassName(className: string): Promise<any | null> {
    const [rows] = await this.pool.execute<any[]>(
      "SELECT s.*, m.name as manufacturer_name, sm.media_store_small as thumbnail, sm.media_store_large as thumbnail_large, sm.production_status, sm.description as sm_description, sm.url as store_url FROM ships s LEFT JOIN manufacturers m ON s.manufacturer_code = m.code LEFT JOIN ship_matrix sm ON s.ship_matrix_id = sm.id WHERE s.class_name = ?",
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
    page?: number;
    limit?: number;
  }): Promise<{ data: any[]; total: number; page: number; limit: number; pages: number }> {
    let sql = "SELECT * FROM components WHERE 1=1";
    let countSql = "SELECT COUNT(*) as total FROM components WHERE 1=1";
    const params: any[] = [];
    const countParams: any[] = [];

    if (filters?.type) {
      sql += " AND type = ?";
      countSql += " AND type = ?";
      params.push(filters.type);
      countParams.push(filters.type);
    }
    if (filters?.size) {
      sql += " AND size = ?";
      countSql += " AND size = ?";
      params.push(parseInt(filters.size));
      countParams.push(parseInt(filters.size));
    }
    if (filters?.manufacturer) {
      sql += " AND manufacturer_code = ?";
      countSql += " AND manufacturer_code = ?";
      params.push(filters.manufacturer.toUpperCase());
      countParams.push(filters.manufacturer.toUpperCase());
    }
    if (filters?.search) {
      sql += " AND (name LIKE ? OR class_name LIKE ?)";
      countSql += " AND (name LIKE ? OR class_name LIKE ?)";
      params.push(`%${filters.search}%`, `%${filters.search}%`);
      countParams.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    const sortCol = this.validateComponentSortColumn(filters?.sort || "name");
    const order = filters?.order?.toUpperCase() === "DESC" ? "DESC" : "ASC";
    sql += ` ORDER BY ${sortCol} ${order}`;

    // Pagination — inline LIMIT/OFFSET (prepared stmt driver limitation)
    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(200, Math.max(1, filters?.limit || 50));
    const offset = (page - 1) * limit;
    sql += ` LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;

    const [countRows] = await this.pool.execute(countSql, countParams);
    const total = (countRows as any[])[0]?.total || 0;
    const [rows] = await this.pool.execute(sql, params);
    return { data: rows as any[], total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getComponentByUuid(uuid: string): Promise<any | null> {
    // Try by UUID first, then by class_name
    const [rows] = await this.pool.execute<any[]>(
      "SELECT * FROM components WHERE uuid = ? OR class_name = ? LIMIT 1",
      [uuid, uuid],
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

  async getShipModules(shipUuid: string): Promise<any[]> {
    const [rows] = await this.pool.execute(
      `SELECT * FROM ship_modules WHERE ship_uuid = ? ORDER BY slot_name`,
      [shipUuid],
    );
    return rows as any[];
  }

  // ======================================================
  //  CHANGELOG - Track changes between extractions
  // ======================================================

  async getChangelog(params: { limit?: string; offset?: string; entityType?: string; changeType?: string }): Promise<{ data: any[]; total: number }> {
    let where = '1=1';
    const values: any[] = [];
    if (params.entityType) { where += ' AND c.entity_type = ?'; values.push(params.entityType); }
    if (params.changeType) { where += ' AND c.change_type = ?'; values.push(params.changeType); }

    const limit = Math.min(parseInt(params.limit || '50', 10), 200);
    const offset = parseInt(params.offset || '0', 10);

    const [rows] = await this.pool.execute(
      `SELECT c.*, e.game_version, e.extracted_at as extraction_date
       FROM changelog c
       LEFT JOIN extraction_log e ON c.extraction_id = e.id
       WHERE ${where}
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [...values, limit, offset],
    );
    const [countRes] = await this.pool.execute<any[]>(`SELECT COUNT(*) as total FROM changelog c WHERE ${where}`, values);
    return { data: rows as any[], total: countRes[0].total };
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
  //  SHOPS - Save & Query
  // ======================================================

  private async saveShopsData(conn: PoolConnection, onProgress?: (msg: string) => void): Promise<{ shops: number; inventory: number }> {
    const { shops, inventory } = this.dfService.extractShops();
    let savedShops = 0;
    let savedInventory = 0;

    for (const shop of shops) {
      try {
        await conn.execute(
          `INSERT INTO shops (name, location, parent_location, shop_type, class_name)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             name=VALUES(name), location=VALUES(location),
             parent_location=VALUES(parent_location), shop_type=VALUES(shop_type),
             updated_at=CURRENT_TIMESTAMP`,
          [shop.name, shop.location || null, shop.parentLocation || null, shop.shopType || null, shop.className]
        );
        savedShops++;
      } catch (e: any) {
        logger.error(`[GameData] Shop ${shop.className}: ${e.message}`);
      }
    }

    // Save inventory — resolve shop_id and component_uuid
    for (const inv of inventory) {
      try {
        const [shopRows]: any = await conn.execute(
          "SELECT id FROM shops WHERE class_name = ? LIMIT 1",
          [inv.shopClassName]
        );
        if (!shopRows.length) continue;
        const shopId = shopRows[0].id;

        // Try to resolve component UUID
        const [compRows]: any = await conn.execute(
          "SELECT uuid FROM components WHERE class_name = ? LIMIT 1",
          [inv.componentClassName]
        );
        const compUuid = compRows.length ? compRows[0].uuid : null;

        await conn.execute(
          `INSERT INTO shop_inventory (shop_id, component_uuid, component_class_name, base_price, rental_price_1d, rental_price_3d, rental_price_7d, rental_price_30d)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             component_uuid=VALUES(component_uuid), base_price=VALUES(base_price),
             rental_price_1d=VALUES(rental_price_1d), rental_price_3d=VALUES(rental_price_3d),
             rental_price_7d=VALUES(rental_price_7d), rental_price_30d=VALUES(rental_price_30d),
             updated_at=CURRENT_TIMESTAMP`,
          [shopId, compUuid, inv.componentClassName, inv.basePrice ?? null,
           inv.rentalPrice1d ?? null, inv.rentalPrice3d ?? null,
           inv.rentalPrice7d ?? null, inv.rentalPrice30d ?? null]
        );
        savedInventory++;
      } catch (e: any) {
        // Skip duplicates or resolution failures silently
      }
    }

    onProgress?.(`Shops: ${savedShops}/${shops.length}, Inventory: ${savedInventory}/${inventory.length}`);
    return { shops: savedShops, inventory: savedInventory };
  }

  /**
   * Get all shops (paginated)
   */
  async getShops(opts: { page?: number; limit?: number; location?: string; type?: string }): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(100, Math.max(1, opts.limit || 20));
    const offset = (page - 1) * limit;

    let where = "1=1";
    const params: any[] = [];

    if (opts.location) {
      where += " AND (location LIKE ? OR parent_location LIKE ?)";
      params.push(`%${opts.location}%`, `%${opts.location}%`);
    }
    if (opts.type) {
      where += " AND shop_type = ?";
      params.push(opts.type);
    }

    const [countRows]: any = await this.pool.execute(`SELECT COUNT(*) as count FROM shops WHERE ${where}`, params);
    const total = countRows[0].count;

    const [rows] = await this.pool.execute(
      `SELECT * FROM shops WHERE ${where} ORDER BY name LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    return { data: rows as any[], total, page, limit };
  }

  /**
   * Get inventory for a specific shop
   */
  async getShopInventory(shopId: number): Promise<any[]> {
    const [rows] = await this.pool.execute(
      `SELECT si.*, c.name as component_name, c.type as component_type, c.size as component_size
       FROM shop_inventory si
       LEFT JOIN components c ON si.component_uuid = c.uuid
       WHERE si.shop_id = ?
       ORDER BY c.type, c.name`,
      [shopId]
    );
    return rows as any[];
  }

  /**
   * Get buy locations for a specific component
   */
  async getComponentBuyLocations(uuid: string): Promise<any[]> {
    const [rows] = await this.pool.execute(
      `SELECT s.name as shop_name, s.location, s.parent_location, s.shop_type,
              si.base_price, si.rental_price_1d, si.rental_price_3d, si.rental_price_7d, si.rental_price_30d
       FROM shop_inventory si
       JOIN shops s ON si.shop_id = s.id
       WHERE si.component_uuid = ?
       ORDER BY si.base_price`,
      [uuid]
    );
    return rows as any[];
  }

  /**
   * Loadout simulator - Calculate aggregated stats for a ship with component swaps
   */
  async calculateLoadout(shipUuid: string, swaps: { portName: string; componentUuid: string }[]): Promise<any> {
    // 1. Get ship base data
    const [shipRows]: any = await this.pool.execute("SELECT * FROM ships WHERE uuid = ?", [shipUuid]);
    if (!shipRows.length) throw new Error("Ship not found");
    const ship = shipRows[0];

    // 2. Get default loadout
    const [loadoutRows]: any = await this.pool.execute(
      `SELECT sl.port_name, sl.port_type, sl.component_uuid, c.*
       FROM ships_loadouts sl
       LEFT JOIN components c ON sl.component_uuid = c.uuid
       WHERE sl.ship_uuid = ?`,
      [shipUuid]
    );

    // 3. Apply swaps
    const loadout = loadoutRows.map((row: any) => ({ ...row }));
    for (const swap of swaps) {
      const idx = loadout.findIndex((l: any) => l.port_name === swap.portName);
      if (idx !== -1) {
        // Replace with new component data
        loadout[idx]._swapped = true;
        loadout[idx]._newComponentUuid = swap.componentUuid;
      }
    }

    // Fetch swapped component data
    for (const l of loadout) {
      if (l._swapped && l._newComponentUuid) {
        const [compRows]: any = await this.pool.execute("SELECT * FROM components WHERE uuid = ?", [l._newComponentUuid]);
        if (compRows.length) {
          const comp = compRows[0];
          // Overwrite component fields
          for (const key of Object.keys(comp)) {
            if (key !== 'uuid' && key !== 'created_at' && key !== 'updated_at') {
              l[key] = comp[key];
            }
          }
          l.component_uuid = comp.uuid;
        }
      }
    }

    // 4. Calculate aggregated stats
    let totalDps = 0;
    let totalBurstDps = 0;
    let totalSustainedDps = 0;
    let totalShieldHp = 0;
    let totalShieldRegen = 0;
    let totalPowerDraw = 0;
    let totalPowerOutput = 0;
    let totalHeatGeneration = 0;
    let totalCoolingRate = 0;
    let totalMissileDamage = 0;
    let weaponCount = 0;
    let missileCount = 0;

    for (const l of loadout) {
      if (!l.component_uuid) continue;
      const type = l.port_type || l.type || '';

      if (type === 'WeaponGun' || l.type === 'WeaponGun') {
        totalDps += parseFloat(l.weapon_dps) || 0;
        totalBurstDps += parseFloat(l.weapon_burst_dps) || 0;
        totalSustainedDps += parseFloat(l.weapon_sustained_dps) || 0;
        weaponCount++;
      }
      if (type === 'Shield' || l.type === 'Shield') {
        totalShieldHp += parseFloat(l.shield_hp) || 0;
        totalShieldRegen += parseFloat(l.shield_regen) || 0;
      }
      if (l.type === 'Missile') {
        totalMissileDamage += parseFloat(l.missile_damage) || 0;
        missileCount++;
      }

      totalPowerDraw += parseFloat(l.power_draw) || 0;
      if (l.type === 'PowerPlant') totalPowerOutput += parseFloat(l.power_output) || 0;
      totalHeatGeneration += parseFloat(l.heat_generation) || 0;
      if (l.type === 'Cooler') totalCoolingRate += parseFloat(l.cooling_rate) || 0;
    }

    return {
      ship: { uuid: ship.uuid, name: ship.name, class_name: ship.class_name },
      swaps: swaps.length,
      stats: {
        weapons: {
          count: weaponCount,
          total_dps: Math.round(totalDps * 100) / 100,
          total_burst_dps: Math.round(totalBurstDps * 100) / 100,
          total_sustained_dps: Math.round(totalSustainedDps * 100) / 100,
        },
        shields: {
          total_hp: Math.round(totalShieldHp * 100) / 100,
          total_regen: Math.round(totalShieldRegen * 100) / 100,
        },
        missiles: {
          count: missileCount,
          total_damage: Math.round(totalMissileDamage * 100) / 100,
        },
        power: {
          total_draw: Math.round(totalPowerDraw * 100) / 100,
          total_output: Math.round(totalPowerOutput * 100) / 100,
          balance: Math.round((totalPowerOutput - totalPowerDraw) * 100) / 100,
        },
        thermal: {
          total_heat_generation: Math.round(totalHeatGeneration * 100) / 100,
          total_cooling_rate: Math.round(totalCoolingRate * 100) / 100,
          balance: Math.round((totalCoolingRate - totalHeatGeneration) * 100) / 100,
        },
      },
      loadout: loadout.map((l: any) => ({
        port_name: l.port_name,
        port_type: l.port_type,
        component_uuid: l.component_uuid,
        component_name: l.name,
        component_type: l.type,
        swapped: !!l._swapped,
      })),
    };
  }

  // ======================================================
  //  HELPERS
  // ======================================================

  private validateSortColumn(col: string): string {
    const allowed = [
      "name", "class_name", "manufacturer_code", "mass", "scm_speed", "max_speed",
      "total_hp", "shield_hp", "crew_size", "cargo_capacity",
      "armor_physical", "armor_energy", "armor_distortion",
      "cross_section_x", "cross_section_y", "cross_section_z",
      "hydrogen_fuel_capacity", "quantum_fuel_capacity",
      "boost_speed_forward", "pitch_max", "yaw_max", "roll_max",
    ];
    return allowed.includes(col) ? col : "name";
  }

  private validateComponentSortColumn(col: string): string {
    const allowed = [
      "name", "class_name", "type", "size", "grade", "manufacturer_code",
      "weapon_dps", "weapon_burst_dps", "weapon_sustained_dps",
      "weapon_damage", "weapon_fire_rate", "weapon_range",
      "weapon_damage_physical", "weapon_damage_energy", "weapon_damage_distortion",
      "shield_hp", "shield_regen", "qd_speed", "qd_spool_time",
      "power_output", "cooling_rate", "hp", "mass",
      "thruster_max_thrust", "radar_range", "fuel_capacity",
    ];
    return allowed.includes(col) ? col : "name";
  }

  // ======================================================
  //  EXTRACTION LOG
  // ======================================================

  async getExtractionLog(): Promise<any[]> {
    const [rows] = await this.pool.execute(
      "SELECT * FROM extraction_log ORDER BY extracted_at DESC LIMIT 20"
    );
    return rows as any[];
  }

  async getLatestExtraction(): Promise<any | null> {
    const [rows] = await this.pool.execute(
      "SELECT * FROM extraction_log ORDER BY extracted_at DESC LIMIT 1"
    );
    return (rows as any[])[0] || null;
  }
}
