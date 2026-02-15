/**
 * ExtractionService — Full extraction pipeline from P4K/DataForge to MySQL
 *
 * This service runs locally on the user's PC with access to the P4K file.
 * It parses binary game data, extracts ships/components/paints/shops,
 * and writes everything to the remote MySQL database.
 */
import { createHash } from "crypto";
import type { Pool, PoolConnection } from "mysql2/promise";
import { DataForgeService, MANUFACTURER_CODES, classifyPort } from "./dataforge-service.js";
import { LocalizationService } from "./localization-service.js";
import logger from "./logger.js";

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

export class ExtractionService {
  private _extracting = false;
  public locService: LocalizationService;

  /** Default batch size for multi-row INSERT statements */
  private static readonly BATCH_SIZE = 50;

  constructor(
    private pool: Pool,
    private dfService: DataForgeService,
  ) {
    this.locService = new LocalizationService();
  }

  // ── Batch INSERT helper ──

  /**
   * Execute a multi-row INSERT … ON DUPLICATE KEY UPDATE in batches.
   * @param conn MySQL connection
   * @param insertHead SQL before VALUES: "INSERT INTO tbl (c1, c2) VALUES"
   * @param updateTail SQL after VALUES: "ON DUPLICATE KEY UPDATE c1=VALUES(c1), …"
   * @param colCount Number of columns per row
   * @param rows Array of flat parameter arrays (each length === colCount)
   * @param batchSize Rows per batch (default: BATCH_SIZE)
   * @returns Number of rows affected
   */
  private async batchUpsert(
    conn: PoolConnection,
    insertHead: string,
    updateTail: string,
    colCount: number,
    rows: (string | number | null)[][],
    batchSize = ExtractionService.BATCH_SIZE,
  ): Promise<number> {
    if (!rows.length) return 0;
    const placeholder = `(${Array(colCount).fill("?").join(",")})`;
    let affected = 0;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const sql = `${insertHead} ${batch.map(() => placeholder).join(",")} ${updateTail}`;
      const params = batch.flat();
      const [result] = await conn.execute<any>(sql, params);
      affected += result.affectedRows ?? batch.length;
    }

    return affected;
  }

  get isExtracting(): boolean { return this._extracting; }

  // ======================================================
  //  FULL EXTRACTION PIPELINE
  // ======================================================

  async extractAll(onProgress?: (msg: string) => void): Promise<ExtractionStats> {
    if (this._extracting) {
      throw new Error("An extraction is already in progress");
    }
    this._extracting = true;
    try {
      return await this._doExtractAll(onProgress);
    } finally {
      this._extracting = false;
    }
  }

  private async _doExtractAll(onProgress?: (msg: string) => void): Promise<ExtractionStats> {
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

    // 1a. Load localization from P4K (global.ini)
    if (!this.locService.isLoaded && (this.dfService as any).provider) {
      onProgress?.("Loading localization (global.ini)…");
      try {
        const locCount = await this.locService.loadFromP4K((this.dfService as any).provider, onProgress);
        onProgress?.(`Localization loaded: ${locCount} entries`);
      } catch (e) {
        onProgress?.(`Localization loading failed (fallback mode): ${(e as Error).message}`);
        stats.errors.push(`Localization: ${(e as Error).message}`);
      }
    }

    // Compute extraction hash from DataForge metadata
    const extractionHash = createHash('sha256')
      .update(`${this.dfService.getVersion?.() || 'unknown'}-${Date.now()}`)
      .digest('hex');
    stats.extractionHash = extractionHash;

    const conn = await this.pool.getConnection();
    try {
      // 1b. Snapshot current data BEFORE cleaning — for changelog comparison
      onProgress?.("Snapshotting current data for changelog…");
      const [oldShipsRaw] = await conn.execute<any[]>(
        "SELECT uuid, class_name, name, manufacturer_code, role, career, mass, scm_speed, max_speed, total_hp, shield_hp, cargo_capacity, missile_damage_total, weapon_damage_total, crew_size FROM ships"
      );
      const [oldCompsRaw] = await conn.execute<any[]>(
        "SELECT uuid, class_name, name, type, sub_type, size, grade, manufacturer_code FROM components"
      );
      const oldShips = new Map(oldShipsRaw.map((s: any) => [s.class_name, s]));
      const oldComps = new Map(oldCompsRaw.map((c: any) => [c.class_name, c]));

      // Wrap the entire extraction in a transaction — if anything fails,
      // the old data remains intact (no downtime with empty tables)
      await conn.beginTransaction();

      // 1c. Clean stale data before fresh extraction (order matters for FK constraints)
      onProgress?.("Cleaning stale data…");
      await conn.execute("DELETE FROM shop_inventory");
      await conn.execute("DELETE FROM shops");
      await conn.execute("DELETE FROM ship_modules");
      await conn.execute("DELETE FROM ships_loadouts");
      await conn.execute("DELETE FROM ship_paints WHERE 1=1");
      await conn.execute("DELETE FROM ships");
      await conn.execute("DELETE FROM components");

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
      await this.saveShopsData(conn, onProgress);

      // 5b. Extract & save paints/liveries
      onProgress?.("Extracting paints…");
      await this.savePaints(conn, onProgress);

      // 6. Cross-reference with ship_matrix
      onProgress?.("Cross-referencing with Ship Matrix…");
      stats.shipMatrixLinked = await this.crossReferenceShipMatrix(conn);

      // 6a. Tag variant types for non-SM ships
      await this.tagVariantTypes(conn);

      // 6b. Hull series SCU fallback from Ship Matrix
      await this.applyHullSeriesCargoFallback(conn);

      // 6c. Log extraction to extraction_log
      stats.durationMs = Date.now() - startTime;
      let extractionId: number | null = null;
      try {
        const [logResult]: any = await conn.execute(
          `INSERT INTO extraction_log (extraction_hash, game_version, ships_count, components_count, manufacturers_count, loadout_ports_count, duration_ms, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [extractionHash, this.dfService.getVersion?.() || null, stats.ships, stats.components, stats.manufacturers, stats.loadoutPorts, stats.durationMs, 'success']
        );
        extractionId = logResult.insertId;
      } catch { /* extraction_log is non-critical */ }

      // 7. Generate changelog by comparing old snapshot with new data
      if (extractionId) {
        try {
          onProgress?.("Generating changelog…");
          await this.generateChangelog(conn, extractionId, oldShips, oldComps);
        } catch (e) {
          logger.warn("Changelog generation failed", { error: String(e) });
        }
      }

      onProgress?.(`✅ Extraction complete: ${stats.ships} ships, ${stats.components} components, ${stats.manufacturers} manufacturers, ${stats.loadoutPorts} loadout ports, ${stats.shipMatrixLinked} linked to Ship Matrix`);

      // Commit the transaction — all data is now atomically visible
      await conn.commit();
      onProgress?.("Transaction committed successfully");
    } catch (e) {
      // Rollback on any error — old data remains intact
      try { await conn.rollback(); } catch { /* rollback best-effort */ }
      onProgress?.("❌ Extraction failed — transaction rolled back, old data preserved");
      throw e;
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

    if (this.locService.isLoaded) {
      for (const c of components) {
        const resolved = this.locService.resolveOrFallback(c.className, c.name);
        if (resolved) c.name = resolved;
      }
      onProgress?.(`Localized ${components.length} component names`);
    }

    const COMP_COLS = `uuid, class_name, name, type, sub_type, size, grade, manufacturer_code,
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
            qd_tuning_rate, qd_alignment_rate, qd_disconnect_range,
            missile_damage, missile_signal_type, missile_lock_time, missile_speed,
            missile_range, missile_lock_range,
            missile_damage_physical, missile_damage_energy, missile_damage_distortion,
            thruster_max_thrust, thruster_type,
            radar_range, radar_detection_lifetime, radar_tracking_signal,
            cm_ammo_count,
            fuel_capacity, fuel_intake_rate,
            emp_damage, emp_radius, emp_charge_time, emp_cooldown,
            qig_jammer_range, qig_snare_radius, qig_charge_time, qig_cooldown`;

    const COMP_UPDATE = `ON DUPLICATE KEY UPDATE
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
            qd_tuning_rate=VALUES(qd_tuning_rate), qd_alignment_rate=VALUES(qd_alignment_rate),
            qd_disconnect_range=VALUES(qd_disconnect_range),
            missile_damage=VALUES(missile_damage), missile_signal_type=VALUES(missile_signal_type),
            missile_lock_time=VALUES(missile_lock_time), missile_speed=VALUES(missile_speed),
            missile_range=VALUES(missile_range), missile_lock_range=VALUES(missile_lock_range),
            missile_damage_physical=VALUES(missile_damage_physical), missile_damage_energy=VALUES(missile_damage_energy),
            missile_damage_distortion=VALUES(missile_damage_distortion),
            thruster_max_thrust=VALUES(thruster_max_thrust), thruster_type=VALUES(thruster_type),
            radar_range=VALUES(radar_range),
            radar_detection_lifetime=VALUES(radar_detection_lifetime),
            radar_tracking_signal=VALUES(radar_tracking_signal),
            cm_ammo_count=VALUES(cm_ammo_count),
            fuel_capacity=VALUES(fuel_capacity), fuel_intake_rate=VALUES(fuel_intake_rate),
            emp_damage=VALUES(emp_damage), emp_radius=VALUES(emp_radius),
            emp_charge_time=VALUES(emp_charge_time), emp_cooldown=VALUES(emp_cooldown),
            qig_jammer_range=VALUES(qig_jammer_range), qig_snare_radius=VALUES(qig_snare_radius),
            qig_charge_time=VALUES(qig_charge_time), qig_cooldown=VALUES(qig_cooldown),
            updated_at=CURRENT_TIMESTAMP`;

    const COL_COUNT = 76; // number of columns above

    /** Map a component object to a flat array of values */
    const toRow = (c: any): (string | number | null)[] => [
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
      c.qdTuningRate ?? null, c.qdAlignmentRate ?? null, c.qdDisconnectRange ?? null,
      c.missileDamage ?? null, c.missileSignalType || null,
      c.missileLockTime ?? null, c.missileSpeed ?? null,
      c.missileRange ?? null, c.missileLockRange ?? null,
      c.missileDamagePhysical ?? null, c.missileDamageEnergy ?? null, c.missileDamageDistortion ?? null,
      c.thrusterMaxThrust ?? null, c.thrusterType || null,
      c.radarRange ?? null, c.radarDetectionLifetime ?? null, c.radarTrackingSignal ?? null,
      c.cmAmmoCount ?? null,
      c.fuelCapacity ?? null, c.fuelIntakeRate ?? null,
      c.empDamage ?? null, c.empRadius ?? null, c.empChargeTime ?? null, c.empCooldown ?? null,
      c.qigJammerRange ?? null, c.qigSnareRadius ?? null, c.qigChargeTime ?? null, c.qigCooldown ?? null,
    ];

    const rows = components.map(toRow);
    const saved = await this.batchUpsert(
      conn,
      `INSERT INTO components (${COMP_COLS}) VALUES`,
      COMP_UPDATE,
      COL_COUNT,
      rows,
    );

    onProgress?.(`Components: ${saved}/${components.length} (batch INSERT)`);
    return components.length; // all attempted
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

    // Pre-load all component class_name → uuid mappings to avoid N+1 queries in saveLoadout
    const [compRows] = await conn.execute<any[]>("SELECT class_name, uuid FROM components");
    const componentUuidCache = new Map<string, string>();
    for (const row of compRows) componentUuidCache.set(row.class_name, row.uuid);
    onProgress?.(`Component UUID cache loaded: ${componentUuidCache.size} entries`);

    for (const [, veh] of vehicles) {
      try {
        const fullData = await this.dfService.extractFullShipData(veh.className);
        if (!fullData) continue;

        // === FILTER: only keep playable/flyable ships ===
        const lcName = veh.className.toLowerCase();
        if (lcName.startsWith('ambx_') || lcName.includes('_test') || lcName.includes('_debug') ||
            lcName.includes('_template') || lcName.includes('_indestructible') ||
            lcName.includes('_unmanned') || lcName.includes('_npc_only') ||
            lcName.includes('_prison') || lcName.includes('_hijacked') ||
            lcName.includes('_drug') || lcName.includes('_ai_only') ||
            lcName.includes('_derelict') || lcName.includes('_wreck')) {
          skippedNonPlayable++;
          continue;
        }
        if (/_PU($|_)/i.test(veh.className) || /_AI_/i.test(veh.className)) {
          skippedNonPlayable++;
          continue;
        }
        if (/_Tier_\d+$/i.test(veh.className)) {
          skippedNonPlayable++;
          continue;
        }
        if (/_Swarm($|_)/i.test(veh.className)) {
          skippedNonPlayable++;
          continue;
        }
        if (/(?:_CIG_|_Event_|_Reward_|_Prize_|_Trophy)/i.test(veh.className)) {
          skippedNonPlayable++;
          continue;
        }

        // Classify vehicle category
        let vehicleCategory = 'ship';
        const GROUND_PATTERNS = /(?:^|\b|_)(cyclone|ursa|rover|spartan|ballista|tonk|nova|centurion|storm|lynx|roc|mule|ptv|greycat|buggy|tumbril|cart)(?:_|\b|$)/i;
        const GRAVLEV_PATTERNS = /(?:^|\b|_)(dragonfly|nox|x1|ranger|hex|pulse|hoverquad)(?:_|\b|$)/i;
        if (GROUND_PATTERNS.test(veh.className)) vehicleCategory = 'ground';
        else if (GRAVLEV_PATTERNS.test(veh.className)) vehicleCategory = 'gravlev';

        // Manufacturer code from className prefix
        const mfgMatch = veh.className.match(/^([A-Z]{3,5})_/);
        let mfgCode = mfgMatch?.[1] || null;

        // Override Esperia-manufactured Vanduul replicas
        const ESPERIA_OVERRIDES: Record<string, string> = {
          'VNCL_Glaive': 'ESPR',
          'VNCL_Blade': 'ESPR',
          'VNCL_Blade_Swarm': 'ESPR',
          'VNCL_Stinger': 'ESPR',
        };
        if (ESPERIA_OVERRIDES[veh.className]) {
          mfgCode = ESPERIA_OVERRIDES[veh.className];
        }

        // Resolve ship display name via localization
        let shipDisplayName = fullData.name || veh.name;
        if (this.locService.isLoaded) {
          const locName = this.locService.resolveShipName(veh.className);
          if (locName) shipDisplayName = locName;
        }

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
            vehicle_category,
            game_data
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            vehicle_category=VALUES(vehicle_category),
            game_data=VALUES(game_data),
            extracted_at=CURRENT_TIMESTAMP`,
          [
            fullData.ref, veh.className, shipDisplayName, mfgCode,
            fullData.vehicle?.role || null, fullData.vehicle?.career || null,
            fullData.vehicle?.dogfightEnabled ?? true, fullData.vehicle?.crewSize || 1,
            fullData.vehicle?.vehicleDefinition || veh.className,
            fullData.vehicle?.size?.x || null, fullData.vehicle?.size?.y || null, fullData.vehicle?.size?.z || null,
            fullData.hull?.mass || null, fullData.ifcs?.scmSpeed || null, fullData.ifcs?.maxSpeed || null,
            fullData.ifcs?.boostSpeedForward || null, fullData.ifcs?.boostSpeedBackward || null,
            fullData.ifcs?.angularVelocity?.x || null, fullData.ifcs?.angularVelocity?.z || null, fullData.ifcs?.angularVelocity?.y || null,
            fullData.hull?.totalHp || null,
            fullData.fuelCapacity || null, fullData.qtFuelCapacity || null,
            fullData.shield?.maxShieldHealth || fullData.shield?.maxHp || null,
            fullData.armor?.data?.armor?.damageMultiplier?.damagePhysical ?? null,
            fullData.armor?.data?.armor?.damageMultiplier?.damageEnergy ?? null,
            fullData.armor?.data?.armor?.damageMultiplier?.damageDistortion ?? null,
            fullData.armor?.data?.armor?.damageMultiplier?.damageThermal ?? null,
            fullData.armor?.data?.armor?.damageMultiplier?.damageBiochemical ?? null,
            fullData.armor?.data?.armor?.damageMultiplier?.damageStun ?? null,
            fullData.armor?.data?.armor?.signalIR ?? null,
            fullData.armor?.data?.armor?.signalEM ?? null,
            fullData.armor?.data?.armor?.signalCS ?? null,
            fullData.crossSection?.x || null, fullData.crossSection?.y || null, fullData.crossSection?.z || null,
            fullData.shortName || null, fullData.description || null,
            fullData.grade || null, fullData.cargo ?? null,
            fullData.insurance?.baseWaitTimeMinutes || null, fullData.insurance?.baseExpeditingFee || null,
            vehicleCategory,
            JSON.stringify(fullData),
          ],
        );
        savedShips++;

        // Extract & save loadout
        const loadout = this.dfService.extractVehicleLoadout(veh.className);
        if (loadout && loadout.length > 0) {
          await conn.execute("DELETE FROM ships_loadouts WHERE ship_uuid = ?", [fullData.ref]);
          totalPorts += await this.saveLoadout(conn, fullData.ref, loadout, componentUuidCache);
          await this.computeAndStoreMissileDamage(conn, fullData.ref);
          await this.computeAndStoreWeaponDamage(conn, fullData.ref);
        }

        // Detect & save modules
        await this.detectAndSaveModules(conn, fullData, veh.className);

        if (savedShips % 20 === 0) onProgress?.(`Ships: ${savedShips}/${vehicles.size}…`);
      } catch (e: any) {
        logger.error(`Ship ${veh.className}: ${e.message}`);
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
      minSize?: number;
      maxSize?: number;
      children?: Array<{ portName: string; componentClassName?: string }>;
    }>,
    componentUuidCache: Map<string, string>,
  ): Promise<number> {
    let count = 0;

    for (const port of loadout) {
      try {
        const compUuid = port.componentClassName
          ? (componentUuidCache.get(port.componentClassName) || null)
          : null;

        const [result] = await conn.execute<any>(
          `INSERT INTO ships_loadouts
            (ship_uuid, port_name, port_type, component_class_name, component_uuid, port_min_size, port_max_size)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [shipUuid, port.portName, port.portType || null, port.componentClassName || null, compUuid, port.minSize ?? null, port.maxSize ?? null],
        );
        const parentId = result.insertId;
        count++;

        if (port.children && port.children.length > 0) {
          for (const child of port.children) {
            const childCompUuid = child.componentClassName
              ? (componentUuidCache.get(child.componentClassName) || null)
              : null;

            await conn.execute(
              `INSERT INTO ships_loadouts
                (ship_uuid, port_name, port_type, component_class_name, component_uuid, parent_id)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [shipUuid, child.portName, classifyPort(child.portName, child.componentClassName || ""), child.componentClassName || null, childCompUuid, parentId],
            );
            count++;
          }
        }
      } catch (e: any) {
        logger.error(`Loadout port ${port.portName}: ${e.message}`);
      }
    }
    return count;
  }

  private async computeAndStoreMissileDamage(conn: PoolConnection, shipUuid: string): Promise<void> {
    try {
      const [rows] = await conn.execute<any[]>(
        `SELECT COALESCE(SUM(c.missile_damage), 0) as total
         FROM ships_loadouts sl JOIN components c ON sl.component_uuid = c.uuid
         WHERE sl.ship_uuid = ? AND c.type IN ('Missile','WeaponMissile')`,
        [shipUuid],
      );
      const total = parseFloat(rows[0]?.total) || 0;
      await conn.execute("UPDATE ships SET missile_damage_total = ? WHERE uuid = ?", [total > 0 ? total : null, shipUuid]);
    } catch { /* Non-critical */ }
  }

  private async computeAndStoreWeaponDamage(conn: PoolConnection, shipUuid: string): Promise<void> {
    try {
      const [rows] = await conn.execute<any[]>(
        `SELECT COALESCE(SUM(c.weapon_dps), 0) as total_dps
         FROM ships_loadouts sl JOIN components c ON sl.component_uuid = c.uuid
         WHERE sl.ship_uuid = ? AND c.type = 'WeaponGun'`,
        [shipUuid],
      );
      const totalDps = parseFloat(rows[0]?.total_dps) || 0;
      await conn.execute("UPDATE ships SET weapon_damage_total = ? WHERE uuid = ?", [totalDps > 0 ? totalDps : null, shipUuid]);
    } catch { /* Non-critical */ }
  }

  private async detectAndSaveModules(conn: PoolConnection, fullData: any, shipClassName: string): Promise<void> {
    if (!fullData?.ref) return;

    const MODULE_PATTERNS = [/module/i, /modular/i, /compartment/i, /bay_section/i];
    // Noise slot patterns — these contain "module" but are not real swappable modules
    const NOISE_SLOT_PATTERNS = [
      /cargogrid_module/i, /pdc_aimodule/i, /module_dashboard/i,
      /module_seat/i, /thruster_module/i, /power_plant_commandmodule/i,
      /cargo_module/i, /modular_bed/i,
    ];
    const loadout = this.dfService.extractVehicleLoadout(shipClassName);
    if (!loadout) return;

    // Extract ship short name to clean module names (e.g., "Retaliator" from "AEGS_Retaliator")
    const shipShort = shipClassName.replace(/^[A-Z]{2,5}_/, '').replace(/_/g, ' ');

    for (const port of loadout) {
      const isModulePort = MODULE_PATTERNS.some(rx => rx.test(port.portName));
      if (!isModulePort || !port.componentClassName) continue;
      // Skip noise modules (cargo grids, AI modules, dashboards, seats, nacelles, etc.)
      const isNoise = NOISE_SLOT_PATTERNS.some(rx => rx.test(port.portName));
      if (isNoise) continue;

      const slotDisplay = port.portName
        .replace(/hardpoint_/i, '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();

      let moduleName = port.componentClassName
        .replace(/^[A-Z]{2,5}_/, '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();
      // Remove ship name prefix from module name for cleaner display
      const shipShortTitle = shipShort.replace(/\b\w/g, c => c.toUpperCase());
      if (moduleName.startsWith(shipShortTitle)) {
        moduleName = moduleName.slice(shipShortTitle.length).trim();
      }
      moduleName = moduleName || port.componentClassName;

      try {
        await conn.execute(
          `INSERT INTO ship_modules (ship_uuid, slot_name, slot_display_name, module_class_name, module_name, is_default)
           VALUES (?, ?, ?, ?, ?, TRUE)`,
          [fullData.ref, port.portName, slotDisplay, port.componentClassName, moduleName],
        );
      } catch (e: any) {
        logger.error(`Module ${port.portName} on ${shipClassName}: ${e.message}`);
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
    } catch { return null; }
  }

  // ======================================================
  //  PAINTS → ship_paints table
  //  Includes fix for Starfighter/Starlancer (contains-match)
  // ======================================================

  private async savePaints(conn: PoolConnection, onProgress?: (msg: string) => void): Promise<void> {
    const paints = this.dfService.extractPaints();
    if (!paints.length) { onProgress?.("No paints found"); return; }

    const [shipRows] = await conn.execute<any[]>("SELECT uuid, name, class_name FROM ships");
    const nameMap = new Map<string, string>();
    const classMap = new Map<string, string>();
    // Also build a reverse index: ships whose name CONTAINS a keyword
    const shipList: Array<{ uuid: string; name: string; classShort: string }> = [];

    for (const s of shipRows) {
      nameMap.set(s.name.toLowerCase(), s.uuid);
      classMap.set(s.class_name.toLowerCase(), s.uuid);
      const parts = s.class_name.split('_');
      if (parts.length >= 2) {
        const withoutMfg = parts.slice(1).join('_').toLowerCase();
        if (!nameMap.has(withoutMfg)) nameMap.set(withoutMfg, s.uuid);
      }
      shipList.push({
        uuid: s.uuid,
        name: (s.name || '').toLowerCase(),
        classShort: parts.length >= 2 ? parts.slice(1).join('_').toLowerCase() : s.class_name.toLowerCase(),
      });
    }

    let saved = 0;
    let debugSamples = 0;
    const paintRows: (string | number | null)[][] = [];
    await conn.execute("DELETE FROM ship_paints");

    for (const paint of paints) {
      const shortName = paint.shipShortName.toLowerCase().replace(/_/g, ' ');
      const shortNameUnderscore = paint.shipShortName.toLowerCase();

      let shipUuids: string[] = [];
      let match = nameMap.get(shortName) || nameMap.get(shortNameUnderscore);

      if (!match) match = classMap.get(shortNameUnderscore);

      // Prefix match: shortName starts with a ship name
      if (!match) {
        let bestLen = 0;
        for (const [n, uuid] of nameMap) {
          if (shortNameUnderscore.startsWith(n) && n.length > bestLen) {
            match = uuid;
            bestLen = n.length;
          }
        }
      }

      // **FIX**: Contains match — find ships whose name CONTAINS the shortName
      // e.g., shortName="Starfighter" matches "Ares Starfighter Inferno", "Ares Starfighter Ion"
      // e.g., shortName="Starlancer" matches "Starlancer Max", "Starlancer TAC"
      if (!match) {
        for (const ship of shipList) {
          if (ship.name.includes(shortName) || ship.classShort.includes(shortNameUnderscore)) {
            shipUuids.push(ship.uuid);
          }
        }
        shipUuids = [...new Set(shipUuids)];
      }

      if (match) {
        shipUuids = [match];
      } else if (!shipUuids.length) {
        // Try progressively shorter versions
        const segments = shortName.split(' ');
        for (let len = segments.length - 1; len >= 1 && !shipUuids.length; len--) {
          const shorter = segments.slice(0, len).join(' ');
          const shorterU = segments.slice(0, len).join('_');
          const exactMatch = nameMap.get(shorter) || nameMap.get(shorterU);
          if (exactMatch) {
            shipUuids = [exactMatch];
          } else {
            for (const [n, uuid] of nameMap) {
              if (n.startsWith(shorter) || n.startsWith(shorterU)) {
                shipUuids.push(uuid);
              }
            }
            shipUuids = [...new Set(shipUuids)];
          }
        }
      }

      if (!shipUuids.length) {
        if (debugSamples < 15) {
          logger.debug(`[Paints] Unmatched: "${paint.paintClassName}" → shortName="${paint.shipShortName}"`);
          debugSamples++;
        }
        continue;
      }

      for (const shipUuid of shipUuids) {
        paintRows.push([shipUuid, paint.paintClassName, paint.paintName, paint.paintUuid]);
      }
    }

    // Batch insert paints (ignore duplicates / FK errors)
    const PAINT_INSERT = `INSERT IGNORE INTO ship_paints (ship_uuid, paint_class_name, paint_name, paint_uuid) VALUES `;
    await this.batchUpsert(conn, PAINT_INSERT, '', 4, paintRows, ExtractionService.BATCH_SIZE);
    saved = paintRows.length;
    onProgress?.(`Paints: ${saved}/${paints.length} saved (${paints.length - saved} unmatched)`);
  }

  // ======================================================
  //  MANUFACTURERS
  // ======================================================

  private async saveManufacturersFromData(conn: PoolConnection): Promise<number> {
    const codes = new Set<string>();

    const vehicles = this.dfService.getVehicleDefinitions();
    for (const [, veh] of vehicles) {
      const m = veh.className.match(/^([A-Z]{3,5})_/);
      if (m) codes.add(m[1]);
    }

    const components = this.dfService.extractAllComponents();
    for (const c of components) {
      if (c.manufacturerCode) codes.add(c.manufacturerCode);
    }

    for (const code of Object.keys(MANUFACTURER_CODES)) {
      codes.add(code);
    }

    let saved = 0;
    for (const code of codes) {
      const name = MANUFACTURER_CODES[code] || code;
      try {
        await conn.execute(
          `INSERT INTO manufacturers (code, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name)`,
          [code, name],
        );
        saved++;
      } catch (e: any) {
        logger.error(`Manufacturer ${code}: ${e.message}`);
      }
    }
    return saved;
  }

  // ======================================================
  //  CROSS-REFERENCE ships ↔ ship_matrix
  // ======================================================

  private static readonly SM_TO_P4K_ALIASES: Record<string, string> = {
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
    "F8C Lightning": "Lightning F8C",
    "F8C Lightning Executive Edition": "Lightning F8C Exec",
    "P-52 Merlin": "P52 Merlin",
    "P-72 Archimedes": "P72 Archimedes",
    "P-72 Archimedes Emerald": "P72 Archimedes Emerald",
    "Reliant Kore": "Reliant",
    "Expanse": "Starlancer Max",
    "Fury MX": "Fury Miru",
    "890 Jump": "890Jump",
    "600i Explorer": "600i",
    "600i Touring": "600i Touring",
    "MPUV Cargo": "MPUV 1T",
    "MPUV Personnel": "MPUV Transport",
    "MPUV Tractor": "MPUV",
    "Dragonfly Black": "Dragonfly",
    "Dragonfly Yellowjacket": "Dragonfly Yellow",
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
    "Nox": "Nox",
    "Nox Kue": "Nox Kue",
    "Khartu-Al": "Scout",
    "San'tok.yāi": "SanTokYai",
    "San'tok.y?i": "SanTokYai",
    "CSV-SM": "CSV Cargo",
    "Zeus Mk II CL": "Zeus CL",
    "Zeus Mk II ES": "Zeus ES",
    "Zeus Mk II MR": "Zeus MR",
    "Vanguard Warden": "Vanguard",
    "Ursa": "Ursa Rover",
    "Ursa Fortuna": "Ursa Rover Emerald",
    "ROC-DS": "ROC DS",
    "L-21 Wolf": "L21 Wolf",
    "L-22 Alpha Wolf": "L22 AlphaWolf",
  };

  private normalizeForMatch(name: string): string {
    return name.toLowerCase().trim()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/['\u2019\u2018]/g, "'")
      .replace(/-/g, " ").replace(/\./g, "").replace(/\//g, "")
      .replace(/\s+/g, " ");
  }

  private async crossReferenceShipMatrix(conn: PoolConnection): Promise<number> {
    await conn.execute("UPDATE ships SET ship_matrix_id = NULL WHERE ship_matrix_id IS NOT NULL");

    const [ships] = await conn.execute<any[]>("SELECT uuid, class_name, name FROM ships");
    const [smEntries] = await conn.execute<any[]>("SELECT id, name FROM ship_matrix");

    const aliasMap = new Map<string, string>();
    for (const [smName, p4kName] of Object.entries(ExtractionService.SM_TO_P4K_ALIASES)) {
      aliasMap.set(this.normalizeForMatch(smName), this.normalizeForMatch(p4kName));
    }

    const p4kByName = new Map<string, string>();
    const p4kByClassName = new Map<string, string>();
    for (const ship of ships) {
      const norm = this.normalizeForMatch(ship.name || "");
      if (norm && !p4kByName.has(norm)) p4kByName.set(norm, ship.uuid);
      const short = this.normalizeForMatch(ship.class_name.replace(/^[A-Z]{3,5}_/, "").replace(/_/g, " "));
      if (short && !p4kByClassName.has(short)) p4kByClassName.set(short, ship.uuid);
    }

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

    // Pass 1: Exact name matches
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

    for (const { smId, uuid } of results) {
      await conn.execute("UPDATE ships SET ship_matrix_id = ? WHERE uuid = ?", [smId, uuid]);
    }

    return results.length;
  }

  private async applyHullSeriesCargoFallback(conn: PoolConnection): Promise<void> {
    try {
      const [updated]: any = await conn.execute(
        `UPDATE ships s JOIN ship_matrix sm ON s.ship_matrix_id = sm.id
         SET s.cargo_capacity = sm.cargocapacity
         WHERE (s.cargo_capacity IS NULL OR s.cargo_capacity = 0)
           AND sm.cargocapacity IS NOT NULL AND sm.cargocapacity > 0
           AND s.class_name LIKE '%Hull_%'`
      );
      if (updated.affectedRows > 0) {
        logger.info(`Hull series cargo fallback applied to ${updated.affectedRows} ships`);
      }
    } catch (e: any) {
      logger.warn(`Hull cargo fallback failed: ${e.message}`);
    }
  }

  private async tagVariantTypes(conn: PoolConnection): Promise<void> {
    const rules: Array<{ type: string; patterns: string[] }> = [
      { type: 'collector', patterns: ['%_Collector_%', '%_Collector'] },
      { type: 'exec', patterns: ['%_Exec_%', '%_Exec'] },
      { type: 'bis_edition', patterns: ['%_BIS%'] },
      { type: 'tutorial', patterns: ['%_Teach%', '%Tutorial%'] },
      { type: 'enemy_ai', patterns: ['%_EA_%', '%_EA'] },
      { type: 'military', patterns: ['%_Military%', '%_UEE%', '%_Advocacy%'] },
      { type: 'event', patterns: ['%Fleetweek%', '%_FW%', '%CitizenCon%', '%ShipShowdown%', '%Showdown%'] },
      { type: 'pirate', patterns: ['%_PIR%', '%Pirate%'] },
      { type: 'arena_ai', patterns: ['%_Swarm%'] },
    ];

    for (const rule of rules) {
      const conditions = rule.patterns.map(() => 'class_name LIKE ?').join(' OR ');
      await conn.execute(
        `UPDATE ships SET variant_type = ? WHERE ship_matrix_id IS NULL AND variant_type IS NULL AND (${conditions})`,
        [rule.type, ...rule.patterns]
      );
    }

    await conn.execute("UPDATE ships SET variant_type = 'special' WHERE ship_matrix_id IS NULL AND variant_type IS NULL");
  }

  // ======================================================
  //  SHOPS → shops + shop_inventory tables
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
        logger.error(`Shop ${shop.className}: ${e.message}`);
      }
    }

    for (const inv of inventory) {
      try {
        const [shopRows]: any = await conn.execute("SELECT id FROM shops WHERE class_name = ? LIMIT 1", [inv.shopClassName]);
        if (!shopRows.length) continue;
        const shopId = shopRows[0].id;

        const [compRows]: any = await conn.execute("SELECT uuid FROM components WHERE class_name = ? LIMIT 1", [inv.componentClassName]);
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
      } catch { /* Skip duplicates or resolution failures */ }
    }

    onProgress?.(`Shops: ${savedShops}/${shops.length}, Inventory: ${savedInventory}/${inventory.length}`);
    return { shops: savedShops, inventory: savedInventory };
  }

  // ======================================================
  //  CHANGELOG
  // ======================================================

  private async generateChangelog(
    conn: PoolConnection,
    extractionId: number,
    oldShips: Map<string, any>,
    oldComps: Map<string, any>,
  ): Promise<void> {
    const [newShipsRaw] = await conn.execute<any[]>(
      "SELECT uuid, class_name, name, manufacturer_code, role, career, mass, scm_speed, max_speed, total_hp, shield_hp, cargo_capacity, missile_damage_total, weapon_damage_total, crew_size FROM ships"
    );
    const [newCompsRaw] = await conn.execute<any[]>(
      "SELECT uuid, class_name, name, type, sub_type, size, grade, manufacturer_code FROM components"
    );
    const newShips = new Map(newShipsRaw.map((s: any) => [s.class_name, s]));
    const newComps = new Map(newCompsRaw.map((c: any) => [c.class_name, c]));

    const inserts: Array<[number, string, string, string, string, string | null, string | null, string | null]> = [];

    // Added ships
    for (const [cn, ship] of newShips) {
      if (!oldShips.has(cn)) inserts.push([extractionId, 'ship', ship.uuid, ship.name || cn, 'added', null, null, null]);
    }
    // Removed ships
    for (const [cn, ship] of oldShips) {
      if (!newShips.has(cn)) inserts.push([extractionId, 'ship', ship.uuid, ship.name || cn, 'removed', null, null, null]);
    }
    // Modified ships
    const shipFields = ['mass', 'scm_speed', 'max_speed', 'total_hp', 'shield_hp', 'cargo_capacity', 'missile_damage_total', 'weapon_damage_total', 'crew_size', 'role', 'career', 'name'];
    for (const [cn, newShip] of newShips) {
      const oldShip = oldShips.get(cn);
      if (!oldShip) continue;
      for (const field of shipFields) {
        const oldVal = oldShip[field];
        const newVal = newShip[field];
        if (oldVal == null && newVal == null) continue;
        if (typeof oldVal === 'number' && typeof newVal === 'number') {
          if (Math.abs(oldVal - newVal) < 0.01) continue;
        } else if (String(oldVal) === String(newVal)) {
          continue;
        }
        inserts.push([extractionId, 'ship', newShip.uuid, newShip.name || cn, 'modified', field, oldVal != null ? String(oldVal) : null, newVal != null ? String(newVal) : null]);
      }
    }

    // Added components
    for (const [cn, comp] of newComps) {
      if (!oldComps.has(cn)) inserts.push([extractionId, 'component', comp.uuid, comp.name || cn, 'added', null, null, null]);
    }
    // Removed components
    for (const [cn, comp] of oldComps) {
      if (!newComps.has(cn)) inserts.push([extractionId, 'component', comp.uuid, comp.name || cn, 'removed', null, null, null]);
    }

    if (inserts.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < inserts.length; i += batchSize) {
        const batch = inserts.slice(i, i + batchSize);
        const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
        const values = batch.flat();
        await conn.execute(
          `INSERT INTO changelog (extraction_id, entity_type, entity_uuid, entity_name, change_type, field_name, old_value, new_value) VALUES ${placeholders}`,
          values,
        );
      }
      logger.info(`Changelog: ${inserts.length} entries generated`);
    } else {
      logger.info("Changelog: No changes detected");
    }
  }
}
