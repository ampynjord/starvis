/**
 * SHIPS → ships + ship_loadouts tables
 * Includes loadout persistence, missile/weapon damage computation and
 * modular ship slot detection (ship_modules table).
 */
import type { PoolClient } from 'pg';
import modularShipConfig from '../data/modular-ship-config.json' with { type: 'json' };
import { classifyPort, type DataForgeService } from '../dataforge/dataforge-service.js';
import logger from '../logger.js';
import type { GameEnv } from '../module-registry.js';
import type { PersistContext } from './context.js';

type ModularShipSlotConfig = {
  slotName: string;
  slotType: string;
  modulePrefix?: string;
  moduleNames?: string[];
  defaultContains: string;
  tierExtract?: boolean;
  silent?: boolean;
};

const MODULAR_SHIP_CONFIGS = modularShipConfig as Record<string, ModularShipSlotConfig[]>;

export async function saveShips(ctx: PersistContext): Promise<{ ships: number; loadoutPorts: number }> {
  const { conn, env, df, loc, onProgress } = ctx;
  const vehicles = df.getVehicleDefinitions();
  let savedShips = 0;
  let totalPorts = 0;
  let skippedNonPlayable = 0;

  // Pre-load all component class_name → uuid mappings to avoid N+1 queries in saveLoadout
  const { rows: compRows } = await conn.query<any>('SELECT class_name, uuid FROM game.components WHERE env = $1', [env]);
  const componentUuidCache = new Map<string, string>();
  for (const row of compRows) componentUuidCache.set(row.class_name, row.uuid);
  onProgress?.(`Component UUID cache loaded: ${componentUuidCache.size} entries`);

  for (const [, veh] of vehicles) {
    try {
      const fullData = await df.extractFullShipData(veh.className);
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
        /(?:^|\b|_)(cyclone|ursa|rover|spartan|ballista|tonk|nova|centurion|storm|lynx|roc|mule|ptv|greycat|buggy|tumbril|cart|utv)(?:_|\b|$)/i;
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
      if (loc.isLoaded) {
        const locName = loc.resolveShipName(veh.className);
        if (locName) shipDisplayName = locName;
      }

      await conn.query(
        `INSERT INTO game.ships (
          env, uuid, class_name, name, manufacturer_code,
          role, career, crew_size,
          size_x, size_y, size_z,
          mass, scm_speed, max_speed,
          boost_speed_forward, boost_speed_backward,
          pitch_max, yaw_max, roll_max,
          total_hp,
          hydrogen_fuel_capacity, quantum_fuel_capacity,
          shield_hp, shield_regen, shield_regen_delay, shield_down_delay,
          armor_physical, armor_energy, armor_distortion,
          armor_thermal,
          armor_signal_ir, armor_signal_em, armor_signal_cs,
          armor_hp, armor_phys_resist, armor_energy_resist,
          fuse_penetration, component_penetration,
          boost_ramp_up, boost_ramp_down,
          cross_section_x, cross_section_y, cross_section_z,
          short_name, cargo_capacity,
          insurance_claim_time, insurance_expedite_cost,
          vehicle_category,
          game_data
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49)
        ON CONFLICT (uuid, env) DO UPDATE SET
          class_name=EXCLUDED.class_name, name=EXCLUDED.name,
          manufacturer_code=EXCLUDED.manufacturer_code,
          role=EXCLUDED.role, career=EXCLUDED.career,
          crew_size=EXCLUDED.crew_size,
          size_x=EXCLUDED.size_x, size_y=EXCLUDED.size_y, size_z=EXCLUDED.size_z,
          mass=EXCLUDED.mass, scm_speed=EXCLUDED.scm_speed, max_speed=EXCLUDED.max_speed,
          boost_speed_forward=EXCLUDED.boost_speed_forward,
          boost_speed_backward=EXCLUDED.boost_speed_backward,
          pitch_max=EXCLUDED.pitch_max, yaw_max=EXCLUDED.yaw_max, roll_max=EXCLUDED.roll_max,
          total_hp=EXCLUDED.total_hp,
          hydrogen_fuel_capacity=EXCLUDED.hydrogen_fuel_capacity,
          quantum_fuel_capacity=EXCLUDED.quantum_fuel_capacity,
          shield_hp=EXCLUDED.shield_hp, shield_regen=EXCLUDED.shield_regen,
          shield_regen_delay=EXCLUDED.shield_regen_delay, shield_down_delay=EXCLUDED.shield_down_delay,
          armor_physical=EXCLUDED.armor_physical, armor_energy=EXCLUDED.armor_energy,
          armor_distortion=EXCLUDED.armor_distortion, armor_thermal=EXCLUDED.armor_thermal,
          armor_signal_ir=EXCLUDED.armor_signal_ir, armor_signal_em=EXCLUDED.armor_signal_em,
          armor_signal_cs=EXCLUDED.armor_signal_cs,
          armor_hp=EXCLUDED.armor_hp, armor_phys_resist=EXCLUDED.armor_phys_resist,
          armor_energy_resist=EXCLUDED.armor_energy_resist,
          fuse_penetration=EXCLUDED.fuse_penetration, component_penetration=EXCLUDED.component_penetration,
          boost_ramp_up=EXCLUDED.boost_ramp_up, boost_ramp_down=EXCLUDED.boost_ramp_down,
          cross_section_x=EXCLUDED.cross_section_x, cross_section_y=EXCLUDED.cross_section_y,
          cross_section_z=EXCLUDED.cross_section_z,
          short_name=EXCLUDED.short_name, cargo_capacity=EXCLUDED.cargo_capacity,
          insurance_claim_time=EXCLUDED.insurance_claim_time,
          insurance_expedite_cost=EXCLUDED.insurance_expedite_cost,
          vehicle_category=EXCLUDED.vehicle_category,
          game_data=EXCLUDED.game_data,
          extracted_at=CURRENT_TIMESTAMP`,
        [
          env,
          fullData.ref,
          veh.className,
          shipDisplayName,
          mfgCode,
          fullData.vehicle?.role || null,
          fullData.vehicle?.career || null,
          fullData.vehicle?.crewSize || 1,
          fullData.vehicle?.size?.x || null,
          fullData.vehicle?.size?.y || null,
          fullData.vehicle?.size?.z || null,
          fullData.hull?.mass || null,
          fullData.ifcs?.scmSpeed != null ? Math.round(fullData.ifcs.scmSpeed) : null,
          fullData.ifcs?.maxSpeed != null ? Math.round(fullData.ifcs.maxSpeed) : null,
          fullData.ifcs?.boostSpeedForward != null ? Math.round(fullData.ifcs.boostSpeedForward) : null,
          fullData.ifcs?.boostSpeedBackward != null ? Math.round(fullData.ifcs.boostSpeedBackward) : null,
          fullData.ifcs?.angularVelocity?.x || null,
          fullData.ifcs?.angularVelocity?.z || null,
          fullData.ifcs?.angularVelocity?.y || null,
          fullData.hull?.totalHp != null ? Math.round(fullData.hull.totalHp) : null,
          fullData.fuelCapacity || null,
          fullData.qtFuelCapacity || null,
          (fullData.shield?.maxShieldHealth ?? fullData.shield?.maxHp) != null
            ? Math.round(fullData.shield!.maxShieldHealth ?? fullData.shield!.maxHp!)
            : null,
          fullData.shield?.maxShieldRegen ?? null,
          fullData.shield?.damagedRegenDelay ?? null,
          fullData.shield?.downedRegenDelay ?? null,
          fullData.armor?.data?.armor?.damageMultiplier?.damagePhysical ?? null,
          fullData.armor?.data?.armor?.damageMultiplier?.damageEnergy ?? null,
          fullData.armor?.data?.armor?.damageMultiplier?.damageDistortion ?? null,
          fullData.armor?.data?.armor?.damageMultiplier?.damageThermal ?? null,
          fullData.armor?.data?.armor?.signalIR ?? null,
          fullData.armor?.data?.armor?.signalEM ?? null,
          fullData.armor?.data?.armor?.signalCS ?? null,
          fullData.armor?.data?.health?.hp ?? null,
          fullData.armor?.data?.health?.damageResistanceMultiplier?.physical ?? null,
          fullData.armor?.data?.health?.damageResistanceMultiplier?.energy ?? null,
          fullData.vehicle?.fusePenetrationDamageMultiplier ?? null,
          fullData.vehicle?.componentPenetrationDamageMultiplier ?? null,
          fullData.ifcs?.afterburner?.afterburnerRampUpTime ?? null,
          fullData.ifcs?.afterburner?.afterburnerRampDownTime ?? null,
          fullData.crossSection?.x || null,
          fullData.crossSection?.y || null,
          fullData.crossSection?.z || null,
          fullData.shortName || null,
          fullData.cargo ?? null,
          fullData.insurance?.baseWaitTimeMinutes || null,
          fullData.insurance?.baseExpeditingFee || null,
          vehicleCategory,
          JSON.stringify(fullData),
        ],
      );
      savedShips++;

      // Extract & save loadout
      const loadout = df.extractVehicleLoadout(veh.className);
      if (loadout && loadout.length > 0) {
        await conn.query('DELETE FROM game.ship_loadouts WHERE ship_uuid = $1 AND env = $2', [fullData.ref, env]);
        totalPorts += await saveLoadout(conn, env, fullData.ref, loadout, componentUuidCache);
        await computeAndStoreMissileDamage(conn, env, fullData.ref);
        await computeAndStoreWeaponDamage(conn, env, fullData.ref);
      }

      // Detect & save modules
      await detectAndSaveModules(conn, env, df, fullData, veh.className);

      if (savedShips % 20 === 0) onProgress?.(`Ships: ${savedShips}/${vehicles.size}…`);
    } catch (e: unknown) {
      logger.error(`Ship ${veh.className}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  onProgress?.(`Ships: ${savedShips}/${vehicles.size} (${skippedNonPlayable} non-playable skipped)`);
  return { ships: savedShips, loadoutPorts: totalPorts };
}

async function saveLoadout(
  conn: PoolClient,
  env: GameEnv,
  shipUuid: string,
  loadout: Array<{
    portName: string;
    portType?: string;
    componentClassName?: string | null;
    minSize?: number;
    maxSize?: number;
    children?: any[];
  }>,
  componentUuidCache: Map<string, string>,
): Promise<number> {
  let count = 0;

  // Recursive helper: inserts a port and all its children at any depth
  const insertPort = async (
    port: {
      portName: string;
      portType?: string;
      componentClassName?: string | null;
      minSize?: number;
      maxSize?: number;
      children?: any[];
    },
    parentId: number | null,
  ): Promise<void> => {
    const compUuid = port.componentClassName ? componentUuidCache.get(port.componentClassName) || null : null;
    let insertId: number;
    if (parentId === null) {
      // Root port — include size columns
      const result = await conn.query<any>(
        `INSERT INTO game.ship_loadouts
          (env, ship_uuid, port_name, port_type, component_class_name, component_uuid, port_min_size, port_max_size)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          env,
          shipUuid,
          port.portName,
          port.portType || null,
          port.componentClassName || null,
          compUuid,
          port.minSize ?? null,
          port.maxSize ?? null,
        ],
      );
      insertId = result.rows[0].id;
    } else {
      const result = await conn.query<any>(
        `INSERT INTO game.ship_loadouts
          (env, ship_uuid, port_name, port_type, component_class_name, component_uuid, parent_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          env,
          shipUuid,
          port.portName,
          port.portType || classifyPort(port.portName, port.componentClassName || ''),
          port.componentClassName || null,
          compUuid,
          parentId,
        ],
      );
      insertId = result.rows[0].id;
    }
    count++;
    if (port.children && port.children.length > 0) {
      for (const child of port.children) {
        await insertPort(child, insertId);
      }
    }
  };

  for (const port of loadout) {
    try {
      await insertPort(port, null);
    } catch (e: unknown) {
      logger.error(`Loadout port ${port.portName}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return count;
}

async function computeAndStoreMissileDamage(conn: PoolClient, env: GameEnv, shipUuid: string): Promise<void> {
  try {
    const { rows } = await conn.query<any>(
      `SELECT COALESCE(SUM(c.missile_damage), 0) as total
       FROM game.ship_loadouts sl JOIN game.components c ON sl.component_uuid = c.uuid AND sl.env = c.env
       WHERE sl.ship_uuid = $1 AND sl.env = $2 AND c.type IN ('Missile','WeaponMissile')`,
      [shipUuid, env],
    );
    let total = parseFloat(rows[0]?.total) || 0;

    // Fallback for DataForge v8: some racks (e.g. MRCK_S09_AEGS_Eclipse) lost their
    // SEntityComponentDefaultLoadoutParams, so missiles don't appear in ship_loadouts.
    // Use rack_count × max(missile_damage for that size) as an approximation.
    if (total === 0) {
      const { rows: rackRows } = await conn.query<any>(
        `SELECT COALESCE(SUM(
           rack.rack_count * COALESCE((
             SELECT MAX(m.missile_damage)
             FROM game.components m
             WHERE m.env = rack.env
               AND m.type IN ('Missile','WeaponMissile')
               AND m.size = rack.rack_missile_size
               AND m.missile_damage > 0
               AND m.class_name NOT LIKE 'G%'
           ), 0)
         ), 0) AS total
         FROM game.ship_loadouts sl
         JOIN game.components rack ON sl.component_uuid = rack.uuid AND sl.env = rack.env
         WHERE sl.ship_uuid = $1 AND sl.env = $2
           AND rack.type = 'MissileRack'
           AND rack.rack_count > 0
           AND rack.rack_missile_size > 0`,
        [shipUuid, env],
      );
      total = parseFloat(rackRows[0]?.total) || 0;
    }

    await conn.query('UPDATE game.ships SET missile_damage_total = $1 WHERE uuid = $2 AND env = $3', [
      total > 0 ? total : null,
      shipUuid,
      env,
    ]);
  } catch {
    /* Non-critical */
  }
}

async function computeAndStoreWeaponDamage(conn: PoolClient, env: GameEnv, shipUuid: string): Promise<void> {
  try {
    const { rows } = await conn.query<any>(
      `SELECT COALESCE(SUM(c.weapon_dps), 0) as total_dps
       FROM game.ship_loadouts sl JOIN game.components c ON sl.component_uuid = c.uuid AND sl.env = c.env
       WHERE sl.ship_uuid = $1 AND sl.env = $2 AND c.type = 'WeaponGun'`,
      [shipUuid, env],
    );
    const totalDps = parseFloat(rows[0]?.total_dps) || 0;
    await conn.query('UPDATE game.ships SET weapon_damage_total = $1 WHERE uuid = $2 AND env = $3', [
      totalDps > 0 ? totalDps : null,
      shipUuid,
      env,
    ]);
  } catch {
    /* Non-critical */
  }
}

function formatModuleName(className: string): string {
  // e.g. "AEGS_Retaliator_Module_Front_Base" → "Front Base"
  //      "RSI_Apollo_Module_Left_Tier_3" → "Left Tier 3"
  return className
    .replace(/^[A-Z]{2,5}_/, '') // Strip manufacturer prefix
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function extractTier(className: string): number | null {
  const m = className.match(/Tier_?(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
}

async function detectAndSaveModules(
  conn: PoolClient,
  env: GameEnv,
  df: DataForgeService,
  fullData: any,
  shipClassName: string,
): Promise<void> {
  if (!fullData?.ref) return;

  const config = MODULAR_SHIP_CONFIGS[shipClassName];

  if (config) {
    // Config-driven path: enumerate all module alternatives via DataForge prefix search
    await conn.query('DELETE FROM game.ship_modules WHERE ship_uuid = $1 AND env = $2', [fullData.ref, env]);

    for (const slotDef of config) {
      const allModuleNames = slotDef.moduleNames ?? (slotDef.modulePrefix ? df.findEntityClassNamesByPrefix(slotDef.modulePrefix) : []);
      if (allModuleNames.length === 0) {
        if (!slotDef.silent) {
          logger.warn(`No modules found for prefix "${slotDef.modulePrefix ?? '(explicit list)'}" on ${shipClassName}`);
        }
        // Fallback: capture the currently installed module from the ship's base loadout
        // (for ships like Caterpillar/Ironclad where module variants have no DataForge entities)
        if (slotDef.silent) {
          const vehicleLoadout = df.extractVehicleLoadout(shipClassName);
          const slotPort = vehicleLoadout?.find((p) => p.portName === slotDef.slotName);
          if (slotPort?.componentClassName) {
            const installedClass = slotPort.componentClassName;
            const slotDisplay = slotDef.slotName
              .replace(/hardpoint_/i, '')
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (c) => c.toUpperCase())
              .trim();
            try {
              await conn.query(
                `INSERT INTO game.ship_modules
                   (env, ship_uuid, slot_name, slot_display_name, slot_type, module_class_name, module_name, module_tier, is_default, loadout_json)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [
                  env,
                  fullData.ref,
                  slotDef.slotName,
                  slotDisplay,
                  slotDef.slotType,
                  installedClass,
                  formatModuleName(installedClass),
                  null,
                  1,
                  null,
                ],
              );
            } catch (e: unknown) {
              logger.error(
                `Module fallback ${installedClass} (slot ${slotDef.slotName}) on ${shipClassName}: ${e instanceof Error ? e.message : String(e)}`,
              );
            }
          }
        }
        continue;
      }

      const slotDisplay = slotDef.slotName
        .replace(/hardpoint_/i, '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();

      for (const moduleName of allModuleNames) {
        const isDefault = moduleName.includes(slotDef.defaultContains);
        const moduleDisplayName = formatModuleName(moduleName);
        const tier = slotDef.tierExtract ? extractTier(moduleName) : null;

        // Extract the module's own internal ports (racks, weapons, missiles) for tier-correct display
        let loadoutJson: string | null = null;
        try {
          const modulePorts = df.extractVehicleLoadout(moduleName);
          if (modulePorts && modulePorts.length > 0) {
            loadoutJson = JSON.stringify(modulePorts);
          }
        } catch (_) {
          // Module may have no internal ports (e.g. medical, habitation) — that's fine
        }

        try {
          await conn.query(
            `INSERT INTO game.ship_modules
               (env, ship_uuid, slot_name, slot_display_name, slot_type, module_class_name, module_name, module_tier, is_default, loadout_json)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              env,
              fullData.ref,
              slotDef.slotName,
              slotDisplay,
              slotDef.slotType,
              moduleName,
              moduleDisplayName,
              tier,
              isDefault ? 1 : 0,
              loadoutJson,
            ],
          );
        } catch (e: unknown) {
          logger.error(
            `Module ${moduleName} (slot ${slotDef.slotName}) on ${shipClassName}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }
    return;
  }

  // Generic fallback path: save only the default module from the current loadout
  const MODULE_PATTERNS = [/module/i, /modular/i, /compartment/i, /bay_section/i];
  const NOISE_SLOT_PATTERNS = [
    /cargogrid_module/i,
    /pdc_aimodule/i,
    /module_dashboard/i,
    /module_seat/i,
    /thruster_module/i,
    /power_plant_commandmodule/i,
    /cargo_module/i,
    /modular_bed/i,
    /command_module_docking/i,
    /docking_module/i,
  ];
  const loadout = df.extractVehicleLoadout(shipClassName);
  if (!loadout) return;

  const shipShort = shipClassName.replace(/^[A-Z]{2,5}_/, '').replace(/_/g, ' ');

  for (const port of loadout) {
    const isModulePort = MODULE_PATTERNS.some((rx) => rx.test(port.portName));
    if (!isModulePort || !port.componentClassName) continue;
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
    const shipShortTitle = shipShort.replace(/\b\w/g, (c) => c.toUpperCase());
    if (moduleName.startsWith(shipShortTitle)) {
      moduleName = moduleName.slice(shipShortTitle.length).trim();
    }
    moduleName = moduleName || port.componentClassName;

    try {
      await conn.query(
        `INSERT INTO game.ship_modules (env, ship_uuid, slot_name, slot_display_name, module_class_name, module_name, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
        [env, fullData.ref, port.portName, slotDisplay, port.componentClassName, moduleName],
      );
    } catch (e: unknown) {
      logger.error(`Module ${port.portName} on ${shipClassName}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
