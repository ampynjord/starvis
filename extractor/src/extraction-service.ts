/**
 * ExtractionService — Full extraction pipeline from P4K/DataForge to MySQL
 *
 * This service runs locally on the user's PC with access to the P4K file.
 * It parses binary game data, extracts ships/components/paints/shops,
 * and writes everything to the remote MySQL database.
 */
import { createHash } from 'crypto';
import type { Pool, PoolConnection } from 'mysql2/promise';
import { applyHullSeriesCargoFallback, crossReferenceShipMatrix, tagVariantTypes } from './crossref.js';
import { classifyPort, type DataForgeService, MANUFACTURER_CODES } from './dataforge-service.js';
import { LocalizationService } from './localization-service.js';
import logger from './logger.js';

export interface ExtractionStats {
  manufacturers: number;
  ships: number;
  components: number;
  items: number;
  commodities: number;
  loadoutPorts: number;
  shops: number;
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
   * @param updateTail SQL after VALUES: "ON DUPLICATE KEY UPDATE c1=new.c1, …"
   * @param colCount Number of columns per row
   * @param rows Array of flat parameter arrays (each length === colCount)
   * @param batchSize Rows per batch (default: BATCH_SIZE)
   * @returns Number of rows affected
   */
  static async batchUpsert(
    conn: PoolConnection,
    insertHead: string,
    updateTail: string,
    colCount: number,
    rows: (string | number | null)[][],
    batchSize = ExtractionService.BATCH_SIZE,
  ): Promise<number> {
    if (!rows.length) return 0;
    const placeholder = `(${Array(colCount).fill('?').join(',')})`;
    let affected = 0;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const sql = `${insertHead} ${batch.map(() => placeholder).join(',')} AS new ${updateTail}`;
      const params = batch.flat();
      const [result] = await conn.execute<any>(sql, params);
      affected += result.affectedRows ?? batch.length;
    }

    return affected;
  }

  get isExtracting(): boolean {
    return this._extracting;
  }

  // ======================================================
  //  FULL EXTRACTION PIPELINE
  // ======================================================

  async extractAll(onProgress?: (msg: string) => void): Promise<ExtractionStats> {
    if (this._extracting) {
      throw new Error('An extraction is already in progress');
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
      items: 0,
      commodities: 0,
      loadoutPorts: 0,
      shops: 0,
      shipMatrixLinked: 0,
      errors: [],
    };

    // 1. Load DataForge if needed
    if (!this.dfService.isDataForgeLoaded()) {
      onProgress?.('Loading DataForge…');
      const info = await this.dfService.loadDataForge(onProgress);
      onProgress?.(`DataForge loaded: ${info.vehicleCount} vehicles, v${info.version}`);
    }

    // 1a. Load localization from P4K (global.ini)
    const provider = this.dfService.getProvider();
    if (!this.locService.isLoaded && provider) {
      onProgress?.('Loading localization (global.ini)…');
      try {
        const locCount = await this.locService.loadFromP4K(provider, onProgress);
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
      onProgress?.('Snapshotting current data for changelog…');
      const [oldShipsRaw] = await conn.execute<any[]>(
        'SELECT uuid, class_name, name, manufacturer_code, role, career, mass, scm_speed, max_speed, total_hp, shield_hp, cargo_capacity, missile_damage_total, weapon_damage_total, crew_size FROM ships',
      );
      const [oldCompsRaw] = await conn.execute<any[]>(
        'SELECT uuid, class_name, name, type, sub_type, size, grade, manufacturer_code FROM components',
      );
      const oldShips = new Map(oldShipsRaw.map((s: any) => [s.class_name, s]));
      const oldComps = new Map(oldCompsRaw.map((c: any) => [c.class_name, c]));

      const [oldItemsRaw] = await conn.execute<any[]>('SELECT uuid, class_name, name, type, sub_type, manufacturer_code FROM items');
      const [oldCommoditiesRaw] = await conn.execute<any[]>('SELECT uuid, class_name, name, type FROM commodities');
      const oldItems = new Map(oldItemsRaw.map((i: any) => [i.class_name, i]));
      const oldCommodities = new Map(oldCommoditiesRaw.map((c: any) => [c.class_name, c]));

      // Wrap the entire extraction in a transaction — if anything fails,
      // the old data remains intact (no downtime with empty tables)
      await conn.beginTransaction();

      // 1c. Clean stale data before fresh extraction (order matters for FK constraints)
      onProgress?.('Cleaning stale data…');
      await conn.execute('DELETE FROM shop_inventory');
      await conn.execute('DELETE FROM shops');
      await conn.execute('DELETE FROM ship_modules');
      await conn.execute('DELETE FROM ships_loadouts');
      await conn.execute('DELETE FROM ship_paints WHERE 1=1');
      await conn.execute('DELETE FROM ships');
      await conn.execute('DELETE FROM components');
      await conn.execute('DELETE FROM items');
      await conn.execute('DELETE FROM commodities');

      // 2. Collect & save manufacturers FIRST (before ships, due to FK constraint)
      onProgress?.('Saving manufacturers…');
      stats.manufacturers = await this.saveManufacturersFromData(conn);

      // 3. Extract & save components
      onProgress?.('Extracting components…');
      stats.components = await this.saveComponents(conn, onProgress);

      // 3b. Extract & save items (FPS weapons, armor, clothing, gadgets)
      onProgress?.('Extracting items (FPS, armor, clothing)…');
      const itemResult = await this.saveItems(conn, onProgress);
      stats.items = itemResult.items;
      stats.commodities = itemResult.commodities;

      // 4. Extract & save ships + loadouts
      onProgress?.('Extracting ships…');
      const shipResult = await this.saveShips(conn, onProgress);
      stats.ships = shipResult.ships;
      stats.loadoutPorts = shipResult.loadoutPorts;

      // 5. Extract & save shops/vendors
      onProgress?.('Extracting shops & prices…');
      await this.saveShopsData(conn, onProgress);

      // 5b. Extract & save paints/liveries
      onProgress?.('Extracting paints…');
      await this.savePaints(conn, onProgress);

      // 6. Cross-reference with ship_matrix
      onProgress?.('Cross-referencing with Ship Matrix…');
      stats.shipMatrixLinked = await crossReferenceShipMatrix(conn);

      // 6a. Tag variant types for non-SM ships
      await tagVariantTypes(conn);

      // 6b. Hull series SCU fallback from Ship Matrix
      await applyHullSeriesCargoFallback(conn);

      // 6c. Log extraction to extraction_log
      stats.durationMs = Date.now() - startTime;
      let extractionId: number | null = null;
      try {
        const [logResult]: any = await conn.execute(
          `INSERT INTO extraction_log (extraction_hash, game_version, ships_count, components_count, items_count, commodities_count, manufacturers_count, loadout_ports_count, shops_count, duration_ms, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            extractionHash,
            this.dfService.getVersion?.() || null,
            stats.ships,
            stats.components,
            stats.items,
            stats.commodities,
            stats.manufacturers,
            stats.loadoutPorts,
            stats.shops,
            stats.durationMs,
            'success',
          ],
        );
        extractionId = logResult.insertId;
      } catch {
        /* extraction_log is non-critical */
      }

      // 7. Generate changelog by comparing old snapshot with new data
      if (extractionId) {
        try {
          onProgress?.('Generating changelog…');
          await this.generateChangelog(conn, extractionId, oldShips, oldComps, oldItems, oldCommodities);
        } catch (e) {
          logger.warn('Changelog generation failed', { error: String(e) });
        }
      }

      onProgress?.(
        `✅ Extraction complete: ${stats.ships} ships, ${stats.components} components, ${stats.items} items, ${stats.commodities} commodities, ${stats.manufacturers} manufacturers, ${stats.loadoutPorts} loadout ports, ${stats.shops} shops, ${stats.shipMatrixLinked} linked to Ship Matrix`,
      );

      // ── Sanity check — abort if data dropped by >50% ──
      const oldCounts = { ships: oldShipsRaw.length, components: oldCompsRaw.length };
      const threshold = 0.5;
      const sanityErrors: string[] = [];
      if (oldCounts.ships > 20 && stats.ships < oldCounts.ships * threshold) {
        sanityErrors.push(`Ships dropped from ${oldCounts.ships} to ${stats.ships}`);
      }
      if (oldCounts.components > 50 && stats.components < oldCounts.components * threshold) {
        sanityErrors.push(`Components dropped from ${oldCounts.components} to ${stats.components}`);
      }
      if (sanityErrors.length > 0) {
        const msg = `Sanity check failed: ${sanityErrors.join('; ')}`;
        logger.error(msg);
        onProgress?.(`⚠️ ${msg} — rolling back`);
        throw new Error(msg);
      }

      // Commit the transaction — all data is now atomically visible
      await conn.commit();
      onProgress?.('Transaction committed successfully');
    } catch (e) {
      // Rollback on any error — old data remains intact
      try {
        await conn.rollback();
      } catch {
        /* rollback best-effort */
      }
      onProgress?.('❌ Extraction failed — transaction rolled back, old data preserved');
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
            qig_jammer_range, qig_snare_radius, qig_charge_time, qig_cooldown,
            mining_speed, mining_range, mining_resistance, mining_instability,
            tractor_max_force, tractor_max_range,
            salvage_speed, salvage_radius,
            gimbal_type,
            rack_count, rack_missile_size`;

    const COMP_UPDATE = `ON DUPLICATE KEY UPDATE
            class_name=new.class_name, name=new.name, type=new.type,
            sub_type=new.sub_type, size=new.size, grade=new.grade,
            manufacturer_code=new.manufacturer_code,
            mass=new.mass, hp=new.hp,
            power_draw=new.power_draw, power_base=new.power_base, power_output=new.power_output,
            heat_generation=new.heat_generation, cooling_rate=new.cooling_rate,
            weapon_damage=new.weapon_damage, weapon_damage_type=new.weapon_damage_type,
            weapon_fire_rate=new.weapon_fire_rate, weapon_range=new.weapon_range,
            weapon_speed=new.weapon_speed, weapon_ammo_count=new.weapon_ammo_count,
            weapon_pellets_per_shot=new.weapon_pellets_per_shot, weapon_burst_size=new.weapon_burst_size,
            weapon_alpha_damage=new.weapon_alpha_damage, weapon_dps=new.weapon_dps,
            weapon_damage_physical=new.weapon_damage_physical, weapon_damage_energy=new.weapon_damage_energy,
            weapon_damage_distortion=new.weapon_damage_distortion, weapon_damage_thermal=new.weapon_damage_thermal,
            weapon_damage_biochemical=new.weapon_damage_biochemical, weapon_damage_stun=new.weapon_damage_stun,
            weapon_heat_per_shot=new.weapon_heat_per_shot,
            weapon_burst_dps=new.weapon_burst_dps, weapon_sustained_dps=new.weapon_sustained_dps,
            shield_hp=new.shield_hp, shield_regen=new.shield_regen,
            shield_regen_delay=new.shield_regen_delay, shield_hardening=new.shield_hardening,
            shield_faces=new.shield_faces,
            qd_speed=new.qd_speed, qd_spool_time=new.qd_spool_time,
            qd_cooldown=new.qd_cooldown, qd_fuel_rate=new.qd_fuel_rate,
            qd_range=new.qd_range, qd_stage1_accel=new.qd_stage1_accel,
            qd_stage2_accel=new.qd_stage2_accel,
            qd_tuning_rate=new.qd_tuning_rate, qd_alignment_rate=new.qd_alignment_rate,
            qd_disconnect_range=new.qd_disconnect_range,
            missile_damage=new.missile_damage, missile_signal_type=new.missile_signal_type,
            missile_lock_time=new.missile_lock_time, missile_speed=new.missile_speed,
            missile_range=new.missile_range, missile_lock_range=new.missile_lock_range,
            missile_damage_physical=new.missile_damage_physical, missile_damage_energy=new.missile_damage_energy,
            missile_damage_distortion=new.missile_damage_distortion,
            thruster_max_thrust=new.thruster_max_thrust, thruster_type=new.thruster_type,
            radar_range=new.radar_range,
            radar_detection_lifetime=new.radar_detection_lifetime,
            radar_tracking_signal=new.radar_tracking_signal,
            cm_ammo_count=new.cm_ammo_count,
            fuel_capacity=new.fuel_capacity, fuel_intake_rate=new.fuel_intake_rate,
            emp_damage=new.emp_damage, emp_radius=new.emp_radius,
            emp_charge_time=new.emp_charge_time, emp_cooldown=new.emp_cooldown,
            qig_jammer_range=new.qig_jammer_range, qig_snare_radius=new.qig_snare_radius,
            qig_charge_time=new.qig_charge_time, qig_cooldown=new.qig_cooldown,
            mining_speed=new.mining_speed, mining_range=new.mining_range,
            mining_resistance=new.mining_resistance, mining_instability=new.mining_instability,
            tractor_max_force=new.tractor_max_force, tractor_max_range=new.tractor_max_range,
            salvage_speed=new.salvage_speed, salvage_radius=new.salvage_radius,
            gimbal_type=new.gimbal_type,
            rack_count=new.rack_count, rack_missile_size=new.rack_missile_size,
            updated_at=CURRENT_TIMESTAMP`;

    const COL_COUNT = 87; // number of columns above

    /** Map a component object to a flat array of values */
    const toRow = (c: any): (string | number | null)[] => [
      c.uuid,
      c.className,
      c.name,
      c.type,
      c.subType || null,
      c.size ?? null,
      c.grade || null,
      c.manufacturerCode || null,
      c.mass ?? null,
      c.hp ?? null,
      c.powerDraw ?? null,
      c.powerBase ?? null,
      c.powerOutput ?? null,
      c.heatGeneration ?? null,
      c.coolingRate ?? null,
      c.emSignature ?? null,
      c.irSignature ?? null,
      c.weaponDamage ?? null,
      c.weaponDamageType || null,
      c.weaponFireRate ?? null,
      c.weaponRange ?? null,
      c.weaponSpeed ?? null,
      c.weaponAmmoCount ?? null,
      c.weaponPelletsPerShot ?? 1,
      c.weaponBurstSize ?? null,
      c.weaponAlphaDamage ?? null,
      c.weaponDps ?? null,
      c.weaponDamagePhysical ?? null,
      c.weaponDamageEnergy ?? null,
      c.weaponDamageDistortion ?? null,
      c.weaponDamageThermal ?? null,
      c.weaponDamageBiochemical ?? null,
      c.weaponDamageStun ?? null,
      c.weaponHeatPerShot ?? null,
      c.weaponBurstDps ?? null,
      c.weaponSustainedDps ?? null,
      c.shieldHp ?? null,
      c.shieldRegen ?? null,
      c.shieldRegenDelay ?? null,
      c.shieldHardening ?? null,
      c.shieldFaces ?? null,
      c.qdSpeed ?? null,
      c.qdSpoolTime ?? null,
      c.qdCooldown ?? null,
      c.qdFuelRate ?? null,
      c.qdRange ?? null,
      c.qdStage1Accel ?? null,
      c.qdStage2Accel ?? null,
      c.qdTuningRate ?? null,
      c.qdAlignmentRate ?? null,
      c.qdDisconnectRange ?? null,
      c.missileDamage ?? null,
      c.missileSignalType || null,
      c.missileLockTime ?? null,
      c.missileSpeed ?? null,
      c.missileRange ?? null,
      c.missileLockRange ?? null,
      c.missileDamagePhysical ?? null,
      c.missileDamageEnergy ?? null,
      c.missileDamageDistortion ?? null,
      c.thrusterMaxThrust ?? null,
      c.thrusterType || null,
      c.radarRange ?? null,
      c.radarDetectionLifetime ?? null,
      c.radarTrackingSignal ?? null,
      c.cmAmmoCount ?? null,
      c.fuelCapacity ?? null,
      c.fuelIntakeRate ?? null,
      c.empDamage ?? null,
      c.empRadius ?? null,
      c.empChargeTime ?? null,
      c.empCooldown ?? null,
      c.qigJammerRange ?? null,
      c.qigSnareRadius ?? null,
      c.qigChargeTime ?? null,
      c.qigCooldown ?? null,
      c.miningSpeed ?? null,
      c.miningRange ?? null,
      c.miningResistance ?? null,
      c.miningInstability ?? null,
      c.tractorMaxForce ?? null,
      c.tractorMaxRange ?? null,
      c.salvageSpeed ?? null,
      c.salvageRadius ?? null,
      c.gimbalType || null,
      c.rackCount ?? null,
      c.rackMissileSize ?? null,
    ];

    const rows = components.map(toRow);
    const saved = await ExtractionService.batchUpsert(conn, `INSERT INTO components (${COMP_COLS}) VALUES`, COMP_UPDATE, COL_COUNT, rows);

    onProgress?.(`Components: ${saved}/${components.length} (batch INSERT)`);
    return components.length; // all attempted
  }

  // ======================================================
  //  SHIPS → ships + ships_loadouts tables
  // ======================================================

  private async saveShips(conn: PoolConnection, onProgress?: (msg: string) => void): Promise<{ ships: number; loadoutPorts: number }> {
    const vehicles = this.dfService.getVehicleDefinitions();
    let savedShips = 0;
    let totalPorts = 0;
    let skippedNonPlayable = 0;

    // Pre-load all component class_name → uuid mappings to avoid N+1 queries in saveLoadout
    const [compRows] = await conn.execute<any[]>('SELECT class_name, uuid FROM components');
    const componentUuidCache = new Map<string, string>();
    for (const row of compRows) componentUuidCache.set(row.class_name, row.uuid);
    onProgress?.(`Component UUID cache loaded: ${componentUuidCache.size} entries`);

    for (const [, veh] of vehicles) {
      try {
        const fullData = await this.dfService.extractFullShipData(veh.className);
        if (!fullData) continue;

        // === FILTER: only keep playable/flyable ships ===
        const lcName = veh.className.toLowerCase();
        if (
          lcName.startsWith('ambx_') ||
          lcName.includes('_test') ||
          lcName.includes('_debug') ||
          lcName.includes('_template') ||
          lcName.includes('_indestructible') ||
          lcName.includes('_unmanned') ||
          lcName.includes('_npc_only') ||
          lcName.includes('_prison') ||
          lcName.includes('_hijacked') ||
          lcName.includes('_drug') ||
          lcName.includes('_ai_only') ||
          lcName.includes('_derelict') ||
          lcName.includes('_wreck')
        ) {
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
        const GROUND_PATTERNS =
          /(?:^|\b|_)(cyclone|ursa|rover|spartan|ballista|tonk|nova|centurion|storm|lynx|roc|mule|ptv|greycat|buggy|tumbril|cart)(?:_|\b|$)/i;
        const GRAVLEV_PATTERNS = /(?:^|\b|_)(dragonfly|nox|x1|ranger|hex|pulse|hoverquad)(?:_|\b|$)/i;
        if (GROUND_PATTERNS.test(veh.className)) vehicleCategory = 'ground';
        else if (GRAVLEV_PATTERNS.test(veh.className)) vehicleCategory = 'gravlev';

        // Manufacturer code from className prefix
        const mfgMatch = veh.className.match(/^([A-Z]{3,5})_/);
        let mfgCode = mfgMatch?.[1] || null;

        // Override Esperia-manufactured Vanduul replicas
        const ESPERIA_OVERRIDES: Record<string, string> = {
          VNCL_Glaive: 'ESPR',
          VNCL_Blade: 'ESPR',
          VNCL_Blade_Swarm: 'ESPR',
          VNCL_Stinger: 'ESPR',
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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) AS new
          ON DUPLICATE KEY UPDATE
            class_name=new.class_name, name=new.name,
            manufacturer_code=new.manufacturer_code,
            role=new.role, career=new.career,
            dog_fight_enabled=new.dog_fight_enabled, crew_size=new.crew_size,
            vehicle_definition=new.vehicle_definition,
            size_x=new.size_x, size_y=new.size_y, size_z=new.size_z,
            mass=new.mass, scm_speed=new.scm_speed, max_speed=new.max_speed,
            boost_speed_forward=new.boost_speed_forward,
            boost_speed_backward=new.boost_speed_backward,
            pitch_max=new.pitch_max, yaw_max=new.yaw_max, roll_max=new.roll_max,
            total_hp=new.total_hp,
            hydrogen_fuel_capacity=new.hydrogen_fuel_capacity,
            quantum_fuel_capacity=new.quantum_fuel_capacity,
            shield_hp=new.shield_hp,
            armor_physical=new.armor_physical, armor_energy=new.armor_energy,
            armor_distortion=new.armor_distortion, armor_thermal=new.armor_thermal,
            armor_biochemical=new.armor_biochemical, armor_stun=new.armor_stun,
            armor_signal_ir=new.armor_signal_ir, armor_signal_em=new.armor_signal_em,
            armor_signal_cs=new.armor_signal_cs,
            cross_section_x=new.cross_section_x, cross_section_y=new.cross_section_y,
            cross_section_z=new.cross_section_z,
            short_name=new.short_name, description=new.description,
            ship_grade=new.ship_grade, cargo_capacity=new.cargo_capacity,
            insurance_claim_time=new.insurance_claim_time,
            insurance_expedite_cost=new.insurance_expedite_cost,
            vehicle_category=new.vehicle_category,
            game_data=new.game_data,
            extracted_at=CURRENT_TIMESTAMP`,
          [
            fullData.ref,
            veh.className,
            shipDisplayName,
            mfgCode,
            fullData.vehicle?.role || null,
            fullData.vehicle?.career || null,
            fullData.vehicle?.dogfightEnabled ?? true,
            fullData.vehicle?.crewSize || 1,
            fullData.vehicle?.vehicleDefinition || veh.className,
            fullData.vehicle?.size?.x || null,
            fullData.vehicle?.size?.y || null,
            fullData.vehicle?.size?.z || null,
            fullData.hull?.mass || null,
            fullData.ifcs?.scmSpeed || null,
            fullData.ifcs?.maxSpeed || null,
            fullData.ifcs?.boostSpeedForward || null,
            fullData.ifcs?.boostSpeedBackward || null,
            fullData.ifcs?.angularVelocity?.x || null,
            fullData.ifcs?.angularVelocity?.z || null,
            fullData.ifcs?.angularVelocity?.y || null,
            fullData.hull?.totalHp || null,
            fullData.fuelCapacity || null,
            fullData.qtFuelCapacity || null,
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
            fullData.crossSection?.x || null,
            fullData.crossSection?.y || null,
            fullData.crossSection?.z || null,
            fullData.shortName || null,
            fullData.description || null,
            fullData.grade || null,
            fullData.cargo ?? null,
            fullData.insurance?.baseWaitTimeMinutes || null,
            fullData.insurance?.baseExpeditingFee || null,
            vehicleCategory,
            JSON.stringify(fullData),
          ],
        );
        savedShips++;

        // Extract & save loadout
        const loadout = this.dfService.extractVehicleLoadout(veh.className);
        if (loadout && loadout.length > 0) {
          await conn.execute('DELETE FROM ships_loadouts WHERE ship_uuid = ?', [fullData.ref]);
          totalPorts += await this.saveLoadout(conn, fullData.ref, loadout, componentUuidCache);
          await this.computeAndStoreMissileDamage(conn, fullData.ref);
          await this.computeAndStoreWeaponDamage(conn, fullData.ref);
        }

        // Detect & save modules
        await this.detectAndSaveModules(conn, fullData, veh.className);

        if (savedShips % 20 === 0) onProgress?.(`Ships: ${savedShips}/${vehicles.size}…`);
      } catch (e: unknown) {
        logger.error(`Ship ${veh.className}: ${e instanceof Error ? e.message : String(e)}`);
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
    const childRows: any[][] = [];

    for (const port of loadout) {
      try {
        const compUuid = port.componentClassName ? componentUuidCache.get(port.componentClassName) || null : null;

        const [result] = await conn.execute<any>(
          `INSERT INTO ships_loadouts
            (ship_uuid, port_name, port_type, component_class_name, component_uuid, port_min_size, port_max_size)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            shipUuid,
            port.portName,
            port.portType || null,
            port.componentClassName || null,
            compUuid,
            port.minSize ?? null,
            port.maxSize ?? null,
          ],
        );
        const parentId = result.insertId;
        count++;

        if (port.children && port.children.length > 0) {
          for (const child of port.children) {
            const childCompUuid = child.componentClassName ? componentUuidCache.get(child.componentClassName) || null : null;
            childRows.push([
              shipUuid,
              child.portName,
              classifyPort(child.portName, child.componentClassName || ''),
              child.componentClassName || null,
              childCompUuid,
              parentId,
            ]);
          }
        }
      } catch (e: unknown) {
        logger.error(`Loadout port ${port.portName}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Batch insert children
    if (childRows.length > 0) {
      await ExtractionService.batchUpsert(
        conn,
        `INSERT INTO ships_loadouts (ship_uuid, port_name, port_type, component_class_name, component_uuid, parent_id) VALUES`,
        `ON DUPLICATE KEY UPDATE component_class_name=new.component_class_name, component_uuid=new.component_uuid`,
        6,
        childRows,
      );
      count += childRows.length;
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
      await conn.execute('UPDATE ships SET missile_damage_total = ? WHERE uuid = ?', [total > 0 ? total : null, shipUuid]);
    } catch {
      /* Non-critical */
    }
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
      await conn.execute('UPDATE ships SET weapon_damage_total = ? WHERE uuid = ?', [totalDps > 0 ? totalDps : null, shipUuid]);
    } catch {
      /* Non-critical */
    }
  }

  private async detectAndSaveModules(conn: PoolConnection, fullData: any, shipClassName: string): Promise<void> {
    if (!fullData?.ref) return;

    const MODULE_PATTERNS = [/module/i, /modular/i, /compartment/i, /bay_section/i];
    // Noise slot patterns — these contain "module" but are not real swappable modules
    const NOISE_SLOT_PATTERNS = [
      /cargogrid_module/i,
      /pdc_aimodule/i,
      /module_dashboard/i,
      /module_seat/i,
      /thruster_module/i,
      /power_plant_commandmodule/i,
      /cargo_module/i,
      /modular_bed/i,
    ];
    const loadout = this.dfService.extractVehicleLoadout(shipClassName);
    if (!loadout) return;

    // Extract ship short name to clean module names (e.g., "Retaliator" from "AEGS_Retaliator")
    const shipShort = shipClassName.replace(/^[A-Z]{2,5}_/, '').replace(/_/g, ' ');

    for (const port of loadout) {
      const isModulePort = MODULE_PATTERNS.some((rx) => rx.test(port.portName));
      if (!isModulePort || !port.componentClassName) continue;
      // Skip noise modules (cargo grids, AI modules, dashboards, seats, nacelles, etc.)
      const isNoise = NOISE_SLOT_PATTERNS.some((rx) => rx.test(port.portName));
      if (isNoise) continue;

      const slotDisplay = port.portName
        .replace(/hardpoint_/i, '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();

      let moduleName = port.componentClassName
        .replace(/^[A-Z]{2,5}_/, '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
      // Remove ship name prefix from module name for cleaner display
      const shipShortTitle = shipShort.replace(/\b\w/g, (c) => c.toUpperCase());
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
      } catch (e: unknown) {
        logger.error(`Module ${port.portName} on ${shipClassName}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  private async resolveComponentUuid(conn: PoolConnection, className: string): Promise<string | null> {
    try {
      const [rows] = await conn.execute<any[]>('SELECT uuid FROM components WHERE class_name = ? LIMIT 1', [className]);
      return rows[0]?.uuid || null;
    } catch {
      return null;
    }
  }

  // ======================================================
  //  PAINTS → ship_paints table
  //  Includes fix for Starfighter/Starlancer (contains-match)
  // ======================================================

  private async savePaints(conn: PoolConnection, onProgress?: (msg: string) => void): Promise<void> {
    const paints = this.dfService.extractPaints();
    if (!paints.length) {
      onProgress?.('No paints found');
      return;
    }

    const [shipRows] = await conn.execute<any[]>('SELECT uuid, name, class_name FROM ships');
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
    await conn.execute('DELETE FROM ship_paints');

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
    await ExtractionService.batchUpsert(conn, PAINT_INSERT, '', 4, paintRows, ExtractionService.BATCH_SIZE);
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
        await conn.execute(`INSERT INTO manufacturers (code, name) VALUES (?, ?) AS new ON DUPLICATE KEY UPDATE name=new.name`, [
          code,
          name,
        ]);
        saved++;
      } catch (e: unknown) {
        logger.error(`Manufacturer ${code}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return saved;
  }

  // ======================================================
  //  ITEMS + COMMODITIES → items + commodities tables
  // ======================================================

  private async saveItems(conn: PoolConnection, onProgress?: (msg: string) => void): Promise<{ items: number; commodities: number }> {
    const { items, commodities } = this.dfService.extractItems();
    let savedItems = 0;
    let savedCommodities = 0;

    // ── Batch upsert items ──
    if (items.length > 0) {
      const ITEM_COLS = [
        'uuid',
        'class_name',
        'name',
        'type',
        'sub_type',
        'size',
        'grade',
        'manufacturer_code',
        'mass',
        'hp',
        'weapon_damage',
        'weapon_damage_type',
        'weapon_fire_rate',
        'weapon_range',
        'weapon_speed',
        'weapon_ammo_count',
        'weapon_dps',
        'armor_damage_reduction',
        'armor_temp_min',
        'armor_temp_max',
        'data_json',
      ];
      const ITEM_UPDATE = ITEM_COLS.filter((c) => c !== 'uuid')
        .map((c) => `${c}=new.${c}`)
        .join(', ');
      const ITEM_PH = ITEM_COLS.map(() => '?').join(', ');

      const batchSize = 200;
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const placeholders = batch.map(() => `(${ITEM_PH})`).join(', ');
        const values: unknown[] = [];

        for (const it of batch) {
          values.push(
            it.uuid,
            it.className,
            it.name,
            it.type,
            it.subType,
            it.size,
            it.grade,
            it.manufacturerCode,
            it.mass,
            it.hp,
            it.weaponDamage,
            it.weaponDamageType,
            it.weaponFireRate,
            it.weaponRange,
            it.weaponSpeed,
            it.weaponAmmoCount,
            it.weaponDps,
            it.armorDamageReduction,
            it.armorTempMin,
            it.armorTempMax,
            it.dataJson ? JSON.stringify(it.dataJson) : null,
          );
        }

        await conn.execute(
          `INSERT INTO items (${ITEM_COLS.join(', ')}) VALUES ${placeholders} AS new
           ON DUPLICATE KEY UPDATE ${ITEM_UPDATE}, updated_at=CURRENT_TIMESTAMP`,
          values,
        );
        savedItems += batch.length;
      }
    }

    // ── Batch upsert commodities ──
    if (commodities.length > 0) {
      const COMM_COLS = ['uuid', 'class_name', 'name', 'type', 'sub_type', 'symbol', 'occupancy_scu', 'data_json'];
      const COMM_UPDATE = COMM_COLS.filter((c) => c !== 'uuid')
        .map((c) => `${c}=new.${c}`)
        .join(', ');
      const COMM_PH = COMM_COLS.map(() => '?').join(', ');

      const batchSize = 200;
      for (let i = 0; i < commodities.length; i += batchSize) {
        const batch = commodities.slice(i, i + batchSize);
        const placeholders = batch.map(() => `(${COMM_PH})`).join(', ');
        const values: unknown[] = [];

        for (const cm of batch) {
          values.push(
            cm.uuid,
            cm.className,
            cm.name,
            cm.type,
            cm.subType,
            cm.symbol,
            cm.occupancyScu,
            cm.dataJson ? JSON.stringify(cm.dataJson) : null,
          );
        }

        await conn.execute(
          `INSERT INTO commodities (${COMM_COLS.join(', ')}) VALUES ${placeholders} AS new
           ON DUPLICATE KEY UPDATE ${COMM_UPDATE}, updated_at=CURRENT_TIMESTAMP`,
          values,
        );
        savedCommodities += batch.length;
      }
    }

    onProgress?.(`Items: ${savedItems}, Commodities: ${savedCommodities}`);
    return { items: savedItems, commodities: savedCommodities };
  }

  // ======================================================
  //  SHOPS → shops + shop_inventory tables
  // ======================================================

  private async saveShopsData(conn: PoolConnection, onProgress?: (msg: string) => void): Promise<{ shops: number; inventory: number }> {
    const { shops, inventory } = this.dfService.extractShops();
    let savedShops = 0;
    let savedInventory = 0;

    // Batch insert shops
    const shopRows: any[][] = [];
    for (const shop of shops) {
      shopRows.push([
        shop.name,
        shop.location || null,
        shop.parentLocation || null,
        shop.system || null,
        shop.planetMoon || null,
        shop.city || null,
        shop.shopType || null,
        shop.className,
      ]);
    }
    if (shopRows.length > 0) {
      savedShops = await ExtractionService.batchUpsert(
        conn,
        `INSERT INTO shops (name, location, parent_location, \`system\`, planet_moon, city, shop_type, class_name) VALUES`,
        `ON DUPLICATE KEY UPDATE
           name=new.name, location=new.location,
           parent_location=new.parent_location,
           \`system\`=new.\`system\`, planet_moon=new.planet_moon, city=new.city,
           shop_type=new.shop_type,
           updated_at=CURRENT_TIMESTAMP`,
        8,
        shopRows,
      );
    }

    // Pre-cache shop class_name → id and component class_name → uuid
    const [shopIdRows]: any = await conn.execute('SELECT id, class_name FROM shops');
    const shopIdCache = new Map<string, number>(shopIdRows.map((r: any) => [r.class_name, r.id]));

    const [compUuidRows]: any = await conn.execute('SELECT uuid, class_name FROM components');
    const compUuidCache = new Map<string, string>(compUuidRows.map((r: any) => [r.class_name, r.uuid]));

    // Batch insert inventory
    const invRows: any[][] = [];
    for (const inv of inventory) {
      const shopId = shopIdCache.get(inv.shopClassName);
      if (!shopId) continue;
      const compUuid = compUuidCache.get(inv.componentClassName) || null;
      invRows.push([
        shopId,
        compUuid,
        inv.componentClassName,
        inv.basePrice ?? null,
        inv.rentalPrice1d ?? null,
        inv.rentalPrice3d ?? null,
        inv.rentalPrice7d ?? null,
        inv.rentalPrice30d ?? null,
      ]);
    }
    if (invRows.length > 0) {
      savedInventory = await ExtractionService.batchUpsert(
        conn,
        `INSERT INTO shop_inventory (shop_id, component_uuid, component_class_name, base_price, rental_price_1d, rental_price_3d, rental_price_7d, rental_price_30d) VALUES`,
        `ON DUPLICATE KEY UPDATE
           component_uuid=new.component_uuid, base_price=new.base_price,
           rental_price_1d=new.rental_price_1d, rental_price_3d=new.rental_price_3d,
           rental_price_7d=new.rental_price_7d, rental_price_30d=new.rental_price_30d,
           updated_at=CURRENT_TIMESTAMP`,
        8,
        invRows,
      );
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
    oldItems: Map<string, any>,
    oldCommodities: Map<string, any>,
  ): Promise<void> {
    const [newShipsRaw] = await conn.execute<any[]>(
      'SELECT uuid, class_name, name, manufacturer_code, role, career, mass, scm_speed, max_speed, total_hp, shield_hp, cargo_capacity, missile_damage_total, weapon_damage_total, crew_size FROM ships',
    );
    const [newCompsRaw] = await conn.execute<any[]>(
      'SELECT uuid, class_name, name, type, sub_type, size, grade, manufacturer_code FROM components',
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
    const shipFields = [
      'mass',
      'scm_speed',
      'max_speed',
      'total_hp',
      'shield_hp',
      'cargo_capacity',
      'missile_damage_total',
      'weapon_damage_total',
      'crew_size',
      'role',
      'career',
      'name',
    ];
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
        inserts.push([
          extractionId,
          'ship',
          newShip.uuid,
          newShip.name || cn,
          'modified',
          field,
          oldVal != null ? String(oldVal) : null,
          newVal != null ? String(newVal) : null,
        ]);
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

    // ── Items changelog ──
    const [newItemsRaw] = await conn.execute<any[]>('SELECT uuid, class_name, name, type, sub_type, manufacturer_code FROM items');
    const newItems = new Map(newItemsRaw.map((i: any) => [i.class_name, i]));
    for (const [cn, item] of newItems) {
      if (!oldItems.has(cn)) inserts.push([extractionId, 'item', item.uuid, item.name || cn, 'added', null, null, null]);
    }
    for (const [cn, item] of oldItems) {
      if (!newItems.has(cn)) inserts.push([extractionId, 'item', item.uuid, item.name || cn, 'removed', null, null, null]);
    }

    // ── Commodities changelog ──
    const [newCommoditiesRaw] = await conn.execute<any[]>('SELECT uuid, class_name, name, type FROM commodities');
    const newCommodities = new Map(newCommoditiesRaw.map((c: any) => [c.class_name, c]));
    for (const [cn, commodity] of newCommodities) {
      if (!oldCommodities.has(cn))
        inserts.push([extractionId, 'commodity', commodity.uuid, commodity.name || cn, 'added', null, null, null]);
    }
    for (const [cn, commodity] of oldCommodities) {
      if (!newCommodities.has(cn))
        inserts.push([extractionId, 'commodity', commodity.uuid, commodity.name || cn, 'removed', null, null, null]);
    }

    if (inserts.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < inserts.length; i += batchSize) {
        const batch = inserts.slice(i, i + batchSize);
        const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const values = batch.flat();
        await conn.execute(
          `INSERT INTO changelog (extraction_id, entity_type, entity_uuid, entity_name, change_type, field_name, old_value, new_value) VALUES ${placeholders}`,
          values,
        );
      }
      logger.info(`Changelog: ${inserts.length} entries generated`);
    } else {
      logger.info('Changelog: No changes detected');
    }
  }
}
