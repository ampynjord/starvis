/**
 * Component Extractor — Extracts ship components (weapons, shields, etc.) from DataForge
 *
 * Extracted from DataForgeService.extractAllComponents() to reduce god-class size.
 * Depends on DataForgeContext interface (no circular dependency with DataForgeService).
 */
import type { DataForgeContext } from './dataforge-utils.js';
import { resolveComponentName } from './dataforge-utils.js';
import logger from './logger.js';

function mapAttachDefGrade(grade: unknown): string | null {
  if (typeof grade !== 'number' || grade < 1) return null;
  if (grade === 1) return 'A';
  if (grade === 2) return 'B';
  if (grade === 3) return 'C';
  return 'D';
}

function inferComponentClass(className: string, name?: string | null): string | null {
  const text = `${className} ${name ?? ''}`.toLowerCase();
  if (/stealth|_ste_|_ghost|eclipse|raven|razor_ex/.test(text)) return 'Stealth';
  if (/competition|_comp_|racing|_rac_|razor|m50|350r/.test(text)) return 'Competition';
  if (/military|_mil_|_navy|hornet|gladius|sabre|vanguard|redeemer|hammerhead|idris|javelin/.test(text)) return 'Military';
  if (/industrial|_ind_|mining|mininglaser|salvage|tractor|reclaimer|prospector|mole|vulture|srv|argo/.test(text)) return 'Industrial';
  if (/civilian|_civ_|aurora|mustang|nomad|freelancer|constellation|cutlass|caterpillar|starfarer|600i|890/.test(text)) return 'Civilian';
  return null;
}

function inferIsBespokeComponent(className: string, name?: string | null): boolean {
  const text = `${className} ${name ?? ''}`;
  return /(^|[_\s])(bespoke|custom)([_\s]|$)/i.test(text);
}

/**
 * Extract all ship components from DataForge SCItem records.
 * Scans EntityClassDefinition records in weapon/system paths and resolves
 * component stats (damage, shield HP, power, cooler rate, QD speed, etc.).
 */
export function extractAllComponents(ctx: DataForgeContext): any[] {
  const dfData = ctx.getDfData();
  if (!dfData) return [];
  const entityClassIdx = dfData.structDefs.findIndex((s) => s.name === 'EntityClassDefinition');
  if (entityClassIdx === -1) return [];

  const components: any[] = [];

  // P4K-faithful component type registry.
  // Order matters: more specific patterns must come BEFORE broader ones.
  // Key = DB `type` value; value = regex against the lowercase P4K file path.
  const componentPaths: Record<string, RegExp> = {
    // ── Weapons ──────────────────────────────────────────────────────────────
    Ammunition: /weapons[/\\].*(ballistic|rocket|bullet).*(mag|ammo|munition|missile)[/\\]/i,
    WeaponGun: /scitem.*weapons\/[^/\\]+$/i,
    Turret: /ships\/turret[/\\](?!.*unmanned)/i,
    TurretUnmanned: /turret_?unmanned[/\\]/i,
    RocketPod: /rocket_?pods?[/\\]|rocket_?racks?[/\\]/i,
    MissileRack: /missile_?racks?[/\\]/i,
    Rocket: /rocket[s]?[/\\]/i,
    Missile: /missile[s]?[/\\](?!rack|launcher|_rack)/i,
    Torpedo: /torpedo(?:es)?[/\\]|torped[os][/\\]/i,
    Bomb: /bomb[s]?[/\\]/i,
    // ── Systems ──────────────────────────────────────────────────────────────
    Shield: /shield_?generator[s]?[/\\]|shield[s]?[/\\]/i,
    PowerPlant: /power_?plant[s]?[/\\]|powerplant/i,
    Cooler: /cooler[s]?[/\\]/i,
    // Jump modules BEFORE QuantumDrive (more specific path)
    JumpModule: /jump_?drive[s]?[/\\]|jumpmodule[s]?[/\\]|jump_?module[s]?[/\\]|\/jdrv\//i,
    QuantumDrive: /quantum_?drive[s]?[/\\]|quantumdrive/i,
    // VTOL / retro thrusters covered by subType derived from path in thruster handler below
    Thruster: /thruster[s]?[/\\]/i,
    FuelIntake: /fuel_?intake[s]?[/\\]/i,
    // Quantum fuel tanks BEFORE hydrogen tanks (negative lookahead was not reliable)
    FuelTank: /fuel_?tank[s]?[/\\]/i,
    Radar: /radar[s]?[/\\]/i,
    Countermeasure: /countermeasure[s]?[/\\]|flare[s]?[/\\]|noise[/\\]/i,
    LifeSupport: /life_?support[s]?[/\\]/i,
    EMP: /emp[/\\]|distortion_?charge[/\\]|emp_?generator/i,
    // QIG = "jammer" — QuantumInterdictionGenerator
    QuantumInterdictionGenerator: /quantum_?interdiction[/\\]|qig[/\\]|quantum_?enforcement/i,
    // ── Weapon mounts ─────────────────────────────────────────────────────────
    Gimbal: /weapon_mounts\/gimbal[/\\]/i,
    // ── Utility ───────────────────────────────────────────────────────────────
    MiningLaser:
      /utility\/mining\/miningarm[/\\]|mining_?laser[/\\]|mining(?:sub)?items[/\\]|mining_?(?:gadgets?|modules?|modifiers?)[/\\]/i,
    SalvageHead: /utility\/salvage\/salvagehead[/\\]|salvage_?heads?[/\\]|salvagehead/i,
    TractorBeam: /utility\/tractorbeam[/\\]/i,
    // ── Modular ship modules ──────────────────────────────────────────────────
    ShipModule: /ship_?modules?[/\\]|modular_?modules?[/\\]|cargo_?modules?[/\\]/i,
  };

  let scanned = 0;
  for (const r of dfData.records) {
    if (r.structIndex !== entityClassIdx) continue;
    const fn = (r.fileName || '').toLowerCase();
    if (
      !fn.includes('scitem/ships/') &&
      !fn.includes('scitem') &&
      !fn.includes('/weapon/') &&
      !fn.includes('/missile/') &&
      !fn.includes('/systems/')
    )
      continue;
    let type: string | null = null;
    for (const [t, rx] of Object.entries(componentPaths)) {
      if (rx.test(fn)) {
        type = t;
        break;
      }
    }
    if (!type) continue;
    scanned++;
    try {
      const data = ctx.readInstance(r.structIndex, r.instanceIndex, 0, 4);
      if (!data) continue;
      const className = r.name?.replace('EntityClassDefinition.', '') || '';
      if (!className) continue;
      const lcName = className.toLowerCase();
      if (
        lcName.includes('_test') ||
        lcName.startsWith('test_') ||
        lcName.includes('_debug') ||
        lcName.includes('_template') ||
        lcName.includes('_temp') ||
        lcName.startsWith('temp_') ||
        lcName.includes('_temporary') ||
        lcName.includes('_indestructible') ||
        lcName.includes('_npc_only') ||
        lcName.includes('_placeholder') ||
        lcName.includes('contestedzonereward') ||
        lcName.startsWith('display_')
      )
        continue;

      // Skip FPS weapons (personal weapons, not ship components)
      if (type === 'WeaponGun') {
        const isFpsWeapon = /(?:^|\b|_)(rifles?|pistols?|smg|shotgun|sniper|multitool|lmg|grenade_launcher)(?:_|\b|$)/i.test(lcName);
        if (isFpsWeapon) continue;
      }

      const comp: any = {
        uuid: r.id,
        className,
        name: className.replace(/_/g, ' '),
        type,
        p4kPath: r.fileName || null,
        rawJson: { record: r, data },
      };
      const comps = data.Components;
      if (!Array.isArray(comps)) continue;

      for (const c of comps) {
        if (!c || typeof c !== 'object' || !c.__type) continue;
        const cType = c.__type as string;

        if (cType === 'SAttachableComponentParams') {
          const ad = c.AttachDef;
          if (ad && typeof ad === 'object') {
            if (typeof ad.Size === 'number') comp.size = ad.Size;
            comp.grade = mapAttachDefGrade(ad.Grade);
            const loc = ad.Localization;
            if (loc?.Name && typeof loc.Name === 'string') {
              if (!loc.Name.startsWith('LOC_') && !loc.Name.startsWith('@')) {
                comp.name = loc.Name;
              } else {
                comp.name = resolveComponentName(className);
              }
            }
            if (typeof ad.Manufacturer === 'string' && ad.Manufacturer) {
              const mfgInfo = ctx.extractAllManufacturers().get(ad.Manufacturer);
              if (mfgInfo) {
                comp.manufacturerCode = mfgInfo.code;
                comp.manufacturer = mfgInfo.name;
              }
            }
          }
        }
        if (cType === 'EntityComponentPowerConnection') {
          if (typeof c.PowerBase === 'number') comp.powerBase = Math.round(c.PowerBase * 100) / 100;
          if (typeof c.PowerDraw === 'number') {
            if (type === 'PowerPlant') comp.powerOutput = Math.round(c.PowerDraw * 100) / 100;
            comp.powerDraw = Math.round(c.PowerDraw * 100) / 100;
          }
        }
        if (cType === 'EntityComponentHeatConnection') {
          if (typeof c.ThermalEnergyBase === 'number') comp.heatGeneration = Math.round(c.ThermalEnergyBase * 100) / 100;
          if (typeof c.ThermalEnergyDraw === 'number') comp.heatGeneration = Math.round(c.ThermalEnergyDraw * 100) / 100;
        }
        if (cType === 'SHealthComponentParams') {
          if (typeof c.Health === 'number' && c.Health > 0) comp.hp = Math.round(c.Health);
        }

        // Weapon stats (fire rate for projectile weapons; DPS/range for beam weapons)
        if (cType === 'SCItemWeaponComponentParams') {
          const fireActions = c.fireActions;
          if (Array.isArray(fireActions) && fireActions.length > 0) {
            const pa = fireActions[0];
            if (pa && typeof pa === 'object') {
              if (pa.damagePerSecond && typeof pa.damagePerSecond === 'object') {
                // Beam weapon — continuous-fire, no projectile
                const dps = pa.damagePerSecond as Record<string, unknown>;
                const beamDps =
                  (typeof dps.DamageEnergy === 'number' ? dps.DamageEnergy : 0) +
                  (typeof dps.DamagePhysical === 'number' ? dps.DamagePhysical : 0) +
                  (typeof dps.DamageDistortion === 'number' ? dps.DamageDistortion : 0) +
                  (typeof dps.DamageThermal === 'number' ? dps.DamageThermal : 0);
                if (beamDps > 0) comp.weaponBeamDps = Math.round(beamDps * 10000) / 10000;
                if (typeof pa.fullDamageRange === 'number') comp.weaponFullDamageRange = Math.round(pa.fullDamageRange * 100) / 100;
                if (typeof pa.zeroDamageRange === 'number') comp.weaponZeroDamageRange = Math.round(pa.zeroDamageRange * 100) / 100;
                if (typeof pa.heatPerSecond === 'number') comp.weaponHeatPerSecond = Math.round(pa.heatPerSecond * 10000) / 10000;
                if (typeof pa.maxAmmoLoad === 'number') comp.weaponBeamCapacity = Math.round(pa.maxAmmoLoad * 100) / 100;
                if (typeof pa.regenerationCooldown === 'number')
                  comp.weaponBeamRegenCooldown = Math.round(pa.regenerationCooldown * 100) / 100;
              } else {
                // Projectile weapon — fire rate + ammo path
                if (typeof pa.fireRate === 'number') comp.weaponFireRate = Math.round(pa.fireRate * 100) / 100;
                if (typeof pa.heatPerShot === 'number') comp.weaponHeatPerShot = Math.round(pa.heatPerShot * 10000) / 10000;
                if (typeof pa.chargeTime === 'number') comp.weaponChargeTime = Math.round(pa.chargeTime * 100) / 100;
                const lp = pa.launchParams;
                if (lp && typeof lp === 'object') {
                  if (typeof (lp as Record<string, unknown>).pelletCount === 'number')
                    comp.weaponPelletsPerShot = (lp as Record<string, unknown>).pelletCount as number;
                }
                if (!comp.weaponFireRate && Array.isArray(pa.sequenceEntries)) {
                  let totalFR = 0;
                  for (const se of pa.sequenceEntries) {
                    const wa = (se as Record<string, unknown>)?.weaponAction as Record<string, unknown> | undefined;
                    if (wa && typeof wa.fireRate === 'number') totalFR += wa.fireRate;
                    if (!comp.weaponHeatPerShot && typeof wa?.heatPerShot === 'number')
                      comp.weaponHeatPerShot = Math.round((wa.heatPerShot as number) * 10000) / 10000;
                    if (!comp.weaponPelletsPerShot && (wa?.launchParams as Record<string, unknown>)?.pelletCount)
                      comp.weaponPelletsPerShot = (wa?.launchParams as Record<string, unknown>)?.pelletCount as number;
                  }
                  if (totalFR > 0) comp.weaponFireRate = Math.round(totalFR * 100) / 100;
                }
              }
            }
          }
          if (c.weaponAction && typeof c.weaponAction === 'object' && !comp.weaponFireRate && !comp.weaponBeamDps) {
            if (typeof (c.weaponAction as Record<string, unknown>).fireRate === 'number')
              comp.weaponFireRate = Math.round(((c.weaponAction as Record<string, unknown>).fireRate as number) * 100) / 100;
          }
        }

        if (cType === 'SCItemWeaponGunParams' || cType === 'SCItemGunParams') {
          if (typeof c.ammoContainerRecord === 'string') {
            const ammoRecord = c.ammoContainerRecord.toLowerCase();
            if (ammoRecord.includes('tachyon')) comp.weaponDamageType = 'Tachyon';
            else if (ammoRecord.includes('plasma') || ammoRecord.includes('thermal')) comp.weaponDamageType = 'Plasma';
            else if (ammoRecord.includes('ballistic')) comp.weaponDamageType = 'Ballistic';
            else if (ammoRecord.includes('energy')) comp.weaponDamageType = 'Laser';
            else if (ammoRecord.includes('distortion')) comp.weaponDamageType = 'Distortion';
          }
        }

        // Ammo damage resolution via GUID
        if (cType === 'SAmmoContainerComponentParams') {
          if (typeof c.maxAmmoCount === 'number') comp.weaponAmmoCount = c.maxAmmoCount;
          if (typeof c.initialAmmoCount === 'number' && !comp.weaponAmmoCount) comp.weaponAmmoCount = c.initialAmmoCount;
          const ammoGuid = c.ammoParamsRecord?.__ref;
          if (ammoGuid) {
            try {
              const ammoData = ctx.readRecordByGuid(ammoGuid, 5);
              if (ammoData) {
                if (typeof ammoData.speed === 'number' && !comp.weaponSpeed) comp.weaponSpeed = Math.round(ammoData.speed * 100) / 100;
                if (typeof ammoData.lifetime === 'number' && comp.weaponSpeed)
                  comp.weaponRange = Math.round(ammoData.lifetime * comp.weaponSpeed * 100) / 100;

                const pp = ammoData.projectileParams;
                if (pp && typeof pp === 'object') {
                  const dmg = pp.damage;
                  let physical = 0,
                    energy = 0,
                    distortion = 0,
                    thermal = 0,
                    biochemical = 0,
                    stun = 0;
                  if (dmg && typeof dmg === 'object') {
                    physical = typeof dmg.DamagePhysical === 'number' ? dmg.DamagePhysical : 0;
                    energy = typeof dmg.DamageEnergy === 'number' ? dmg.DamageEnergy : 0;
                    distortion = typeof dmg.DamageDistortion === 'number' ? dmg.DamageDistortion : 0;
                    thermal = typeof dmg.DamageThermal === 'number' ? dmg.DamageThermal : 0;
                    biochemical = typeof dmg.DamageBiochemical === 'number' ? dmg.DamageBiochemical : 0;
                    stun = typeof dmg.DamageStun === 'number' ? dmg.DamageStun : 0;
                  }

                  const detDmg = pp.detonationParams?.explosionParams?.damage;
                  if (detDmg && typeof detDmg === 'object') {
                    const dp = typeof detDmg.DamagePhysical === 'number' ? detDmg.DamagePhysical : 0;
                    const de = typeof detDmg.DamageEnergy === 'number' ? detDmg.DamageEnergy : 0;
                    const dd = typeof detDmg.DamageDistortion === 'number' ? detDmg.DamageDistortion : 0;
                    const dt = typeof detDmg.DamageThermal === 'number' ? detDmg.DamageThermal : 0;
                    const db = typeof detDmg.DamageBiochemical === 'number' ? detDmg.DamageBiochemical : 0;
                    const ds = typeof detDmg.DamageStun === 'number' ? detDmg.DamageStun : 0;
                    physical = Math.max(physical, dp);
                    energy = Math.max(energy, de);
                    distortion = Math.max(distortion, dd);
                    thermal = Math.max(thermal, dt);
                    biochemical = Math.max(biochemical, db);
                    stun = Math.max(stun, ds);
                  }

                  const totalDmg = physical + energy + distortion + thermal + biochemical + stun;
                  if (totalDmg > 0) {
                    comp.weaponDamage = Math.round(totalDmg * 10000) / 10000;
                    comp.weaponDamagePhysical = physical > 0 ? Math.round(physical * 10000) / 10000 : undefined;
                    comp.weaponDamageEnergy = energy > 0 ? Math.round(energy * 10000) / 10000 : undefined;
                    comp.weaponDamageDistortion = distortion > 0 ? Math.round(distortion * 10000) / 10000 : undefined;
                    comp.weaponDamageThermal = thermal > 0 ? Math.round(thermal * 10000) / 10000 : undefined;
                    comp.weaponDamageBiochemical = biochemical > 0 ? Math.round(biochemical * 10000) / 10000 : undefined;
                    comp.weaponDamageStun = stun > 0 ? Math.round(stun * 10000) / 10000 : undefined;
                    const dtypes: [string, number][] = [
                      ['physical', physical],
                      ['energy', energy],
                      ['distortion', distortion],
                      ['thermal', thermal],
                      ['biochemical', biochemical],
                      ['stun', stun],
                    ];
                    const dominantDamageType = dtypes.sort((a, b) => b[1] - a[1])[0][0];
                    comp.weaponDamageType =
                      dominantDamageType === 'physical'
                        ? 'Ballistic'
                        : dominantDamageType === 'energy'
                          ? 'Laser'
                          : dominantDamageType === 'distortion'
                            ? 'Distortion'
                            : dominantDamageType === 'thermal'
                              ? 'Plasma'
                              : dominantDamageType;
                  }

                  if (typeof pp.speed === 'number' && !comp.weaponSpeed) comp.weaponSpeed = Math.round(pp.speed * 100) / 100;
                  if (typeof pp.lifetime === 'number' && comp.weaponSpeed && !comp.weaponRange)
                    comp.weaponRange = Math.round(pp.lifetime * comp.weaponSpeed * 100) / 100;
                }
              }
            } catch (_e) {
              /* ammo resolution — non-critical */
            }
          }
        }

        // Shield
        if (cType === 'SCItemShieldGeneratorParams') {
          if (typeof c.MaxShieldHealth === 'number') comp.shieldHp = Math.round(c.MaxShieldHealth * 100) / 100;
          if (typeof c.MaxShieldRegen === 'number') comp.shieldRegen = Math.round(c.MaxShieldRegen * 10000) / 10000;
          if (typeof c.DamagedRegenDelay === 'number') comp.shieldRegenDelay = Math.round(c.DamagedRegenDelay * 100) / 100;
          if (typeof c.DownedRegenDelay === 'number') comp.shieldDownedRegenDelay = Math.round(c.DownedRegenDelay * 100) / 100;
          else if (typeof c.downedRegenDelay === 'number') comp.shieldDownedRegenDelay = Math.round(c.downedRegenDelay * 100) / 100;
          if (typeof c.Hardening === 'number') comp.shieldHardening = Math.round(c.Hardening * 10000) / 10000;
          if (typeof c.MaxReallocation === 'number') comp.shieldFaces = c.MaxReallocation > 0 ? 6 : 2;
          if (typeof c.ShieldMaxHealth === 'number' && !comp.shieldHp) comp.shieldHp = Math.round(c.ShieldMaxHealth * 100) / 100;
          if (typeof c.ShieldRegenRate === 'number' && !comp.shieldRegen) comp.shieldRegen = Math.round(c.ShieldRegenRate * 10000) / 10000;
        }

        // Power plant
        if (cType === 'SCItemPowerPlantParams') {
          if (typeof c.MaxPower === 'number') comp.powerOutput = Math.round(c.MaxPower * 100) / 100;
          if (typeof c.PowerOutput === 'number' && !comp.powerOutput) comp.powerOutput = Math.round(c.PowerOutput * 100) / 100;
        }

        // Cooler
        if (cType === 'SCItemCoolerParams') {
          if (typeof c.CoolingRate === 'number') comp.coolingRate = Math.round(c.CoolingRate * 100) / 100;
          if (typeof c.MaxCoolingRate === 'number' && !comp.coolingRate) comp.coolingRate = Math.round(c.MaxCoolingRate * 100) / 100;
        }

        // Quantum drive
        if (cType === 'SCItemQuantumDriveParams') {
          if (typeof c.quantumFuelRequirement === 'number') comp.qdFuelRate = c.quantumFuelRequirement;
          if (typeof c.disconnectRange === 'number') comp.qdDisconnectRange = Math.round(c.disconnectRange * 100) / 100;
          if (typeof c.jumpRange === 'number' && c.jumpRange < 1e30) comp.qdRange = Math.round(c.jumpRange * 100) / 100;

          const params = c.params;
          if (params && typeof params === 'object') {
            if (typeof params.driveSpeed === 'number') comp.qdSpeed = Math.round(params.driveSpeed * 100) / 100;
            if (typeof params.spoolUpTime === 'number') comp.qdSpoolTime = Math.round(params.spoolUpTime * 100) / 100;
            if (typeof params.cooldownTime === 'number') comp.qdCooldown = Math.round(params.cooldownTime * 100) / 100;
            if (typeof params.stageOneAccelRate === 'number') comp.qdStage1Accel = Math.round(params.stageOneAccelRate * 100) / 100;
            if (typeof params.stageTwoAccelRate === 'number') comp.qdStage2Accel = Math.round(params.stageTwoAccelRate * 100) / 100;
          }
          if (typeof c.driveSpeed === 'number' && !comp.qdSpeed) comp.qdSpeed = Math.round(c.driveSpeed * 100) / 100;
          if (typeof c.spoolUpTime === 'number' && !comp.qdSpoolTime) comp.qdSpoolTime = Math.round(c.spoolUpTime * 100) / 100;
          if (typeof c.cooldownTime === 'number' && !comp.qdCooldown) comp.qdCooldown = Math.round(c.cooldownTime * 100) / 100;

          const jp = c.jumpParams || c.JumpParams;
          if (jp && typeof jp === 'object') {
            if (typeof jp.Stage1AccelerationRate === 'number' && !comp.qdStage1Accel)
              comp.qdStage1Accel = Math.round(jp.Stage1AccelerationRate * 100) / 100;
            if (typeof jp.Stage2AccelerationRate === 'number' && !comp.qdStage2Accel)
              comp.qdStage2Accel = Math.round(jp.Stage2AccelerationRate * 100) / 100;
          }
          const sjp = c.splineJumpParams || c.SplineJumpParams;
          if (sjp && typeof sjp === 'object') {
            if (typeof sjp.driveSpeed === 'number') comp.qdTuningRate = Math.round(sjp.driveSpeed * 100) / 100;
            if (typeof sjp.stageOneAccelRate === 'number') comp.qdAlignmentRate = Math.round(sjp.stageOneAccelRate * 100) / 100;
          }
          // Calibration stats (4.x)
          const calParams = c.calibrationParams || c.params;
          if (calParams && typeof calParams === 'object') {
            if (typeof calParams.calibrationRate === 'number')
              comp.qdCalibrationRate = Math.round(calParams.calibrationRate * 10000) / 10000;
            if (typeof calParams.calibrationDelay === 'number')
              comp.qdCalibrationDelay = Math.round(calParams.calibrationDelay * 100) / 100;
            if (typeof calParams.maxCalibrationAngle === 'number')
              comp.qdCalibrationMaxAngle = Math.round(calParams.maxCalibrationAngle * 100) / 100;
          }
          if (!comp.qdCalibrationRate && typeof c.calibrationRate === 'number')
            comp.qdCalibrationRate = Math.round(c.calibrationRate * 10000) / 10000;
          if (!comp.qdCalibrationDelay && typeof c.calibrationDelay === 'number')
            comp.qdCalibrationDelay = Math.round(c.calibrationDelay * 100) / 100;
          if (!comp.qdCalibrationMaxAngle && typeof c.maxCalibrationAngle === 'number')
            comp.qdCalibrationMaxAngle = Math.round(c.maxCalibrationAngle * 100) / 100;
        }

        // Missile / Bomb / Torpedo — SCItemMissileParams or SCItemBombParams
        if (cType === 'SCItemMissileParams' || cType === 'SCItemBombParams') {
          const ep = c.explosionParams;
          if (ep && typeof ep === 'object') {
            const dmg = ep.damage;
            if (dmg && typeof dmg === 'object') {
              const physical = typeof dmg.DamagePhysical === 'number' ? dmg.DamagePhysical : 0;
              const energy = typeof dmg.DamageEnergy === 'number' ? dmg.DamageEnergy : 0;
              const distortion = typeof dmg.DamageDistortion === 'number' ? dmg.DamageDistortion : 0;
              const thermal = typeof dmg.DamageThermal === 'number' ? dmg.DamageThermal : 0;
              const biochemical = typeof dmg.DamageBiochemical === 'number' ? dmg.DamageBiochemical : 0;
              const stun = typeof dmg.DamageStun === 'number' ? dmg.DamageStun : 0;
              const total = physical + energy + distortion + thermal + biochemical + stun;
              if (total > 0) {
                comp.missileDamage = Math.round(total * 100) / 100;
                comp.missileDamagePhysical = physical > 0 ? Math.round(physical * 100) / 100 : undefined;
                comp.missileDamageEnergy = energy > 0 ? Math.round(energy * 100) / 100 : undefined;
                comp.missileDamageDistortion = distortion > 0 ? Math.round(distortion * 100) / 100 : undefined;
                comp.missileDamageThermal = thermal > 0 ? Math.round(thermal * 100) / 100 : undefined;
                comp.missileDamageBiochemical = biochemical > 0 ? Math.round(biochemical * 100) / 100 : undefined;
                comp.missileDamageStun = stun > 0 ? Math.round(stun * 100) / 100 : undefined;
              }
            }
            if (typeof ep.maxRadius === 'number') comp.missileExplosionRadius = Math.round(ep.maxRadius * 100) / 100;
            else if (typeof ep.radius === 'number') comp.missileExplosionRadius = Math.round(ep.radius * 100) / 100;
          }
          const gcs = c.GCSParams || c.gcsParams;
          if (gcs && typeof gcs === 'object') {
            if (typeof gcs.linearSpeed === 'number') comp.missileSpeed = Math.round(gcs.linearSpeed * 100) / 100;
            if (typeof gcs.maxAngularVelocity === 'number' || typeof gcs.maxAngularSpeed === 'number') {
              const angVel = gcs.maxAngularVelocity ?? gcs.maxAngularSpeed;
              if (typeof angVel === 'number') comp.missileMaxAngularVelocity = Math.round(angVel * 100) / 100;
            }
          }
          const tp = c.targetingParams;
          if (tp && typeof tp === 'object') {
            if (typeof tp.lockTime === 'number') comp.missileLockTime = Math.round(tp.lockTime * 100) / 100;
            if (typeof tp.trackingSignalType === 'string') comp.missileSignalType = tp.trackingSignalType;
            if (typeof tp.lockRangeMax === 'number') comp.missileLockRange = Math.round(tp.lockRangeMax * 100) / 100;
            if (typeof tp.lockRangeMin === 'number') comp.missileRange = Math.round(tp.lockRangeMin * 100) / 100;
          }
          // Guidance mode from seeker/guidance params
          const seekerParams = c.seekerParams || c.guidanceParams || c.seekertype;
          if (seekerParams && typeof seekerParams === 'object') {
            if (typeof seekerParams.seekerType === 'string') comp.missileGuidanceMode = seekerParams.seekerType;
            else if (typeof seekerParams.guidanceType === 'string') comp.missileGuidanceMode = seekerParams.guidanceType;
          }
          if (!comp.missileGuidanceMode && comp.missileSignalType) comp.missileGuidanceMode = comp.missileSignalType;
        }

        // Projectile params
        if (cType === 'SProjectile' || cType === 'SCItemProjectileParams') {
          const bDmg = c.bulletImpactDamage || c.damage;
          if (bDmg && typeof bDmg === 'object') {
            const dt = Object.entries(bDmg).find(([_k, v]) => typeof v === 'number' && (v as number) > 0);
            if (dt) {
              comp.weaponDamage = Math.round((dt[1] as number) * 10000) / 10000;
              const damageKey = dt[0].replace(/^Damage/i, '').toLowerCase();
              comp.weaponDamageType =
                damageKey === 'physical'
                  ? 'Ballistic'
                  : damageKey === 'energy'
                    ? 'Laser'
                    : damageKey === 'distortion'
                      ? 'Distortion'
                      : damageKey === 'thermal'
                        ? 'Plasma'
                        : dt[0];
            }
          }
          if (typeof c.speed === 'number' && !comp.weaponSpeed) comp.weaponSpeed = Math.round(c.speed * 100) / 100;
          if (typeof c.lifetime === 'number' && comp.weaponSpeed) comp.weaponRange = Math.round(c.lifetime * comp.weaponSpeed * 100) / 100;
        }

        // Thruster
        if (cType === 'SCItemThrusterParams' || cType === 'SItemThrusterParams') {
          if (typeof c.thrustCapacity === 'number') comp.thrusterMaxThrust = Math.round(c.thrustCapacity * 100) / 100;
          if (typeof c.ThrustCapacity === 'number' && !comp.thrusterMaxThrust)
            comp.thrusterMaxThrust = Math.round(c.ThrustCapacity * 100) / 100;
          if (typeof c.maxThrustForce === 'number' && !comp.thrusterMaxThrust)
            comp.thrusterMaxThrust = Math.round(c.maxThrustForce * 100) / 100;
          const thrusterType =
            fn.includes('main') || fn.includes('retro')
              ? fn.includes('retro')
                ? 'Retro'
                : 'Main'
              : fn.includes('vtol')
                ? 'VTOL'
                : fn.includes('mav') || fn.includes('maneuver')
                  ? 'Maneuvering'
                  : 'Main';
          comp.thrusterType = thrusterType;
        }

        // Radar
        if (cType === 'SCItemRadarComponentParams' || cType === 'SRadarComponentParams') {
          const sigDet = c.signatureDetection;
          if (Array.isArray(sigDet) && sigDet.length > 0) {
            const activeSensitivities = sigDet.filter((s: any) => s?.permitPassiveDetection === true && typeof s?.sensitivity === 'number');
            if (activeSensitivities.length > 0) {
              const avgSensitivity =
                activeSensitivities.reduce((sum: number, s: any) => sum + s.sensitivity, 0) / activeSensitivities.length;
              comp.radarTrackingSignal = Math.round(avgSensitivity * 10000) / 10000;
            }
            const piercingValues = sigDet.filter((s: any) => typeof s?.piercing === 'number').map((s: any) => s.piercing);
            if (piercingValues.length > 0) {
              comp.radarDetectionLifetime = Math.round(Math.max(...piercingValues) * 10000) / 10000;
            }
          }
          const pp = c.pingProperties;
          if (pp && typeof pp === 'object') {
            // SC 3.18+ moved explicit ping range to shared balance records.
            // pingRange / scanRange are no longer stored per-component.
            const rawPing = (pp as any).pingRange ?? (pp as any).scanRange ?? (pp as any).PingRange ?? (pp as any).ScanRange;
            const pingRange = rawPing !== undefined && rawPing !== null && rawPing !== '' ? Number(rawPing) : null;
            if (pingRange !== null && !Number.isNaN(pingRange) && pingRange > 0) {
              comp.radarRange = Math.round(pingRange * 100) / 100;
              comp.radarPingRange = comp.radarRange;
            }
            const rawCooldown = (pp as any).cooldownTime ?? (pp as any).CooldownTime;
            if (rawCooldown !== undefined && rawCooldown !== null) {
              const cd = Number(rawCooldown);
              if (!Number.isNaN(cd)) comp.radarPingCooldown = Math.round(cd * 100) / 100;
            }
          }
          // Fallback: top-level detectionRadius / maxRange fields
          const detRange = (() => {
            const v =
              (c as any).detectionRadius ??
              (c as any).maxRange ??
              (c as any).scanRange ??
              (c as any).DetectionRadius ??
              (c as any).MaxRange ??
              (c as any).ScanRange;
            if (v === undefined || v === null || v === '') return null;
            const n = Number(v);
            return Number.isNaN(n) ? null : n;
          })();
          if (detRange !== null && detRange > 0 && !comp.radarRange) comp.radarRange = Math.round(detRange * 100) / 100;
          // Derived range: SC 3.18+ stores sensitivity, not absolute range.
          // Approximate using community-calibrated formula: size × 10 000 + 5 000 m base × signal.
          if (!comp.radarRange && comp.radarTrackingSignal && typeof comp.size === 'number') {
            const baseRange = (comp.size > 0 ? comp.size : 1) * 10000 + 5000;
            comp.radarRange = Math.round(baseRange * comp.radarTrackingSignal);
            comp.radarPingRange = comp.radarRange;
          }
        }

        // Countermeasure
        if (cType === 'SCItemCountermeasureParams' || cType === 'SCountermeasureParams') {
          if (typeof c.ammoCount === 'number') comp.cmAmmoCount = c.ammoCount;
        }
        if (type === 'Countermeasure' && cType === 'SAmmoContainerComponentParams') {
          if (typeof c.maxAmmoCount === 'number') comp.cmAmmoCount = c.maxAmmoCount;
          if (typeof c.initialAmmoCount === 'number' && !comp.cmAmmoCount) comp.cmAmmoCount = c.initialAmmoCount;
        }
        // Countermeasure type from path/name
        // Ship-specific hardware launchers (MFRCODE_Ship_CML_Chaff) vs generic ammo (CML_Noise_Small)
        if (type === 'Countermeasure' && !comp.cmType) {
          const isHardwareLauncher = !lcName.startsWith('cml_');
          const isNoise = fn.includes('noise') || fn.includes('chaff') || lcName.includes('chaff');
          const isDecoy = fn.includes('decoy') || fn.includes('cml_decoy') || fn.includes('flare') || lcName.includes('flare');
          if (isHardwareLauncher) {
            if (isNoise) comp.cmType = 'Noise Launcher';
            else if (isDecoy) comp.cmType = 'Decoy Launcher';
          } else {
            if (isNoise) comp.cmType = 'Noise';
            else if (isDecoy) comp.cmType = 'Decoy';
          }
        }
        // Promote cmType → subType so the standard sub_type filter works
        if (type === 'Countermeasure' && comp.cmType && !comp.subType) {
          comp.subType = comp.cmType;
        }

        // Fuel Tank
        if (cType === 'SCItemFuelTankParams') {
          if (typeof c.capacity === 'number') comp.fuelCapacity = Math.round(c.capacity * 100) / 100;
        }
        if (type === 'FuelTank' && cType === 'ResourceContainer') {
          const cap =
            typeof c.capacity === 'object' ? c.capacity?.standardCargoUnits || 0 : typeof c.capacity === 'number' ? c.capacity : 0;
          if (cap > 0) comp.fuelCapacity = Math.round(cap * 100) / 100;
        }

        // Fuel Intake
        if (cType === 'SCItemFuelIntakeParams' || cType === 'SFuelIntakeParams') {
          if (typeof c.fuelPushRate === 'number') comp.fuelIntakeRate = Math.round(c.fuelPushRate * 10000) / 10000;
          if (typeof c.FuelPushRate === 'number' && !comp.fuelIntakeRate) comp.fuelIntakeRate = Math.round(c.FuelPushRate * 10000) / 10000;
        }

        // EMP
        if (cType === 'SCItemEMPParams' || cType === 'SEMPParams') {
          if (typeof c.distortionDamage === 'number') comp.empDamage = Math.round(c.distortionDamage * 100) / 100;
          if (typeof c.DistortionDamage === 'number' && !comp.empDamage) comp.empDamage = Math.round(c.DistortionDamage * 100) / 100;
          if (typeof c.empRadius === 'number') comp.empRadius = Math.round(c.empRadius * 100) / 100;
          if (typeof c.maximumRadius === 'number' && !comp.empRadius) comp.empRadius = Math.round(c.maximumRadius * 100) / 100;
          if (typeof c.chargeTime === 'number') comp.empChargeTime = Math.round(c.chargeTime * 100) / 100;
          if (typeof c.ChargeTime === 'number' && !comp.empChargeTime) comp.empChargeTime = Math.round(c.ChargeTime * 100) / 100;
          if (typeof c.cooldownTime === 'number') comp.empCooldown = Math.round(c.cooldownTime * 100) / 100;
          if (typeof c.CooldownTime === 'number' && !comp.empCooldown) comp.empCooldown = Math.round(c.CooldownTime * 100) / 100;
          const empDmg = c.damage || c.damageInfo;
          if (empDmg && typeof empDmg === 'object') {
            const dist = typeof empDmg.DamageDistortion === 'number' ? empDmg.DamageDistortion : 0;
            if (dist > 0 && !comp.empDamage) comp.empDamage = Math.round(dist * 100) / 100;
          }
        }

        // Quantum Interdiction Generator
        if (cType === 'SCItemQuantumInterdictionGeneratorParams' || cType === 'SQuantumInterdictionGeneratorParams') {
          const js = c.jammerSettings;
          if (js && typeof js === 'object') {
            if (typeof js.jammerRange === 'number') comp.qigJammerRange = Math.round(js.jammerRange * 100) / 100;
          }
          if (typeof c.jammerRange === 'number' && !comp.qigJammerRange) comp.qigJammerRange = Math.round(c.jammerRange * 100) / 100;
          const ps = c.quantumInterdictionPulseSettings;
          if (ps && typeof ps === 'object') {
            if (typeof ps.radiusMeters === 'number') comp.qigSnareRadius = Math.round(ps.radiusMeters * 100) / 100;
            if (typeof ps.chargeTimeSecs === 'number') comp.qigChargeTime = Math.round(ps.chargeTimeSecs * 100) / 100;
            if (typeof ps.cooldownTimeSecs === 'number') comp.qigCooldown = Math.round(ps.cooldownTimeSecs * 100) / 100;
          }
          if (typeof c.chargeTime === 'number' && !comp.qigChargeTime) comp.qigChargeTime = Math.round(c.chargeTime * 100) / 100;
          if (typeof c.cooldownTime === 'number' && !comp.qigCooldown) comp.qigCooldown = Math.round(c.cooldownTime * 100) / 100;
        }

        // Mining laser — legacy absolute-value params (pre-4.x)
        if (cType === 'SCItemMiningLaserParams' || cType === 'SMiningLaserParams') {
          if (typeof c.miningExtractionLaserPower === 'number') comp.miningSpeed = Math.round(c.miningExtractionLaserPower * 10000) / 10000;
          if (typeof c.MiningExtractionLaserPower === 'number' && !comp.miningSpeed)
            comp.miningSpeed = Math.round(c.MiningExtractionLaserPower * 10000) / 10000;
          if (typeof c.laserInstability === 'number') comp.miningInstability = Math.round(c.laserInstability * 10000) / 10000;
          if (typeof c.LaserInstability === 'number' && !comp.miningInstability)
            comp.miningInstability = Math.round(c.LaserInstability * 10000) / 10000;
          if (typeof c.resistanceModifier === 'number') comp.miningResistance = Math.round(c.resistanceModifier * 10000) / 10000;
          if (typeof c.optimalRange === 'number') comp.miningRange = Math.round(c.optimalRange * 100) / 100;
          if (typeof c.OptimalRange === 'number' && !comp.miningRange) comp.miningRange = Math.round(c.OptimalRange * 100) / 100;
        }

        // Mining laser — 4.x modifier-based params (SEntityComponentMiningLaserParams)
        if (cType === 'SEntityComponentMiningLaserParams') {
          const mod = c.miningLaserModifiers;
          if (mod && typeof mod === 'object') {
            const instability = mod.laserInstability;
            if (instability && typeof instability.value === 'number')
              comp.miningInstability = Math.round(instability.value * 10000) / 10000;
            const resistance = mod.resistanceModifier;
            if (resistance && typeof resistance.value === 'number') comp.miningResistance = Math.round(resistance.value * 10000) / 10000;
          }
        }

        // Tractor beam — legacy dedicated params (pre-4.x)
        if (cType === 'SCItemTractorBeamParams' || cType === 'STractorBeamParams') {
          if (typeof c.maxForce === 'number') comp.tractorMaxForce = Math.round(c.maxForce * 100) / 100;
          if (typeof c.MaxForce === 'number' && !comp.tractorMaxForce) comp.tractorMaxForce = Math.round(c.MaxForce * 100) / 100;
          if (typeof c.maxRange === 'number') comp.tractorMaxRange = Math.round(c.maxRange * 100) / 100;
          if (typeof c.MaxRange === 'number' && !comp.tractorMaxRange) comp.tractorMaxRange = Math.round(c.MaxRange * 100) / 100;
        }

        // Tractor beam + Salvage — 4.x stats live inside SCItemWeaponComponentParams.fireActions
        if (cType === 'SCItemWeaponComponentParams' && Array.isArray(c.fireActions)) {
          for (const fa of c.fireActions as Record<string, unknown>[]) {
            if (!fa || typeof fa !== 'object') continue;
            const faType = fa.__type as string | undefined;

            // Tractor beam fire action
            if (faType === 'SWeaponActionFireTractorBeamParams') {
              if (typeof fa.maxForce === 'number' && !comp.tractorMaxForce) comp.tractorMaxForce = Math.round(fa.maxForce * 100) / 100;
              if (typeof fa.maxDistance === 'number' && !comp.tractorMaxRange)
                comp.tractorMaxRange = Math.round(fa.maxDistance * 100) / 100;
            }

            // Salvage beam fire action
            if (faType === 'SWeaponActionFireSalvageRepairParams') {
              if (typeof fa.materialEfficiency === 'number' && !comp.salvageSpeed)
                comp.salvageSpeed = Math.round((fa.materialEfficiency as number) * 10000) / 10000;
              const rp = fa.rangeParams as Record<string, unknown> | null | undefined;
              if (rp && typeof rp === 'object') {
                if (typeof rp.maxBeamDistance === 'number' && !comp.salvageRange)
                  comp.salvageRange = Math.round((rp.maxBeamDistance as number) * 100) / 100;
                if (typeof rp.aimPointSensorRadius === 'number' && !comp.salvageRadius)
                  comp.salvageRadius = Math.round((rp.aimPointSensorRadius as number) * 10000) / 10000;
              }
            }
          }
        }

        // Salvage — legacy dedicated params (pre-4.x)
        if (cType === 'SCItemSalvageParams' || cType === 'SSalvageParams' || cType === 'SCItemSalvageModifierParams') {
          if (typeof c.salvageSpeed === 'number' && !comp.salvageSpeed) comp.salvageSpeed = Math.round(c.salvageSpeed * 10000) / 10000;
          if (typeof c.SalvageSpeed === 'number' && !comp.salvageSpeed) comp.salvageSpeed = Math.round(c.SalvageSpeed * 10000) / 10000;
          if (typeof c.radius === 'number' && !comp.salvageRadius) comp.salvageRadius = Math.round(c.radius * 100) / 100;
          if (typeof c.Radius === 'number' && !comp.salvageRadius) comp.salvageRadius = Math.round(c.Radius * 100) / 100;
        }

        // Gimbal / mount type detection + stats
        if (type === 'Gimbal') {
          if (fn.includes('gimbal')) comp.gimbalType = 'Gimbal';
          else if (fn.includes('fixed')) comp.gimbalType = 'Fixed';
          else comp.gimbalType = 'Gimbal';
        }
        if (cType === 'SCItemGimbalComponentParams' || cType === 'SItemGimbalComponentParams') {
          // Max deflection angle (take max of horizontal/vertical, prefer the larger one)
          const maxH = typeof c.maxHorizontalAngle === 'number' ? c.maxHorizontalAngle : typeof c.maxYaw === 'number' ? c.maxYaw : null;
          const maxV = typeof c.maxVerticalAngle === 'number' ? c.maxVerticalAngle : typeof c.maxPitch === 'number' ? c.maxPitch : null;
          if (maxH !== null || maxV !== null) {
            comp.gimbalMaxAngle = Math.round(Math.max(maxH ?? 0, maxV ?? 0) * 100) / 100;
          }
          const pitchSpd =
            typeof c.pitchSpeed === 'number' ? c.pitchSpeed : typeof c.angularSpeedPitch === 'number' ? c.angularSpeedPitch : null;
          if (pitchSpd !== null) comp.gimbalPitchSpeed = Math.round(pitchSpd * 100) / 100;
          const yawSpd = typeof c.yawSpeed === 'number' ? c.yawSpeed : typeof c.angularSpeedYaw === 'number' ? c.angularSpeedYaw : null;
          if (yawSpd !== null) comp.gimbalYawSpeed = Math.round(yawSpd * 100) / 100;
          if (!comp.gimbalMaxAngle && !pitchSpd && !yawSpd) {
            // Fallback: coupling strength may indicate fixed vs powered
            if (typeof c.couplingStrength === 'number') comp.gimbalMaxAngle = Math.round(c.couplingStrength * 100) / 100;
          }
        }
        // Turret arc extraction
        if (
          (type === 'Turret' || type === 'TurretUnmanned') &&
          (cType === 'SCItemTurretBaseComponentParams' ||
            cType === 'SItemTurretBaseComponentParams' ||
            cType === 'SCItemTurretSocketComponentParams')
        ) {
          const minPitch = typeof c.minPitch === 'number' ? c.minPitch : typeof c.minArcVertical === 'number' ? c.minArcVertical : null;
          const maxPitch = typeof c.maxPitch === 'number' ? c.maxPitch : typeof c.maxArcVertical === 'number' ? c.maxArcVertical : null;
          const minYaw = typeof c.minYaw === 'number' ? c.minYaw : typeof c.minArcHorizontal === 'number' ? c.minArcHorizontal : null;
          const maxYaw = typeof c.maxYaw === 'number' ? c.maxYaw : typeof c.maxArcHorizontal === 'number' ? c.maxArcHorizontal : null;
          if (minPitch !== null) comp.turretMinPitch = Math.round(minPitch * 100) / 100;
          if (maxPitch !== null) comp.turretMaxPitch = Math.round(maxPitch * 100) / 100;
          if (minYaw !== null) comp.turretMinYaw = Math.round(minYaw * 100) / 100;
          if (maxYaw !== null) comp.turretMaxYaw = Math.round(maxYaw * 100) / 100;
        }

        // Missile rack: count sub-ports
        if (type === 'MissileRack' && cType === 'SItemPortContainerComponentParams') {
          const ports = c.Ports;
          if (Array.isArray(ports)) {
            comp.rackCount = ports.length;
            // Try to get missile size from first port
            for (const port of ports) {
              if (port && typeof port === 'object') {
                if (typeof port.MinSize === 'number') comp.rackMissileSize = port.MinSize;
                else if (typeof port.MaxSize === 'number') comp.rackMissileSize = port.MaxSize;
                break;
              }
            }
          }
        }
      }

      // Derived stats
      if (comp.weaponDamage && comp.weaponFireRate) {
        const pellets = comp.weaponPelletsPerShot || 1;
        comp.weaponAlphaDamage = Math.round(comp.weaponDamage * pellets * 10000) / 10000;
        comp.weaponDps = Math.round(comp.weaponAlphaDamage * (comp.weaponFireRate / 60) * 10000) / 10000;

        if (comp.weaponHeatPerShot && comp.weaponHeatPerShot > 0) {
          const shotsToOverheat = Math.max(1, Math.floor(1.0 / comp.weaponHeatPerShot));
          const timeToOverheat = shotsToOverheat / (comp.weaponFireRate / 60);
          const burstDamage = comp.weaponAlphaDamage * shotsToOverheat;

          if (timeToOverheat > 0) {
            comp.weaponBurstDps = Math.round((burstDamage / timeToOverheat) * 10000) / 10000;
          }
          const heatPerSecond = comp.weaponHeatPerShot * (comp.weaponFireRate / 60);
          const estimatedCooldown = Math.max(1.0, 1.0 / (heatPerSecond * 0.4));
          const cycleTime = timeToOverheat + estimatedCooldown;
          if (cycleTime > 0) {
            comp.weaponSustainedDps = Math.round((burstDamage / cycleTime) * 10000) / 10000;
          }
        } else {
          comp.weaponBurstDps = comp.weaponDps;
          comp.weaponSustainedDps = comp.weaponDps;
        }
      }

      // ── P4K-faithful subType derivation ─────────────────────────────────────
      // Derives sub_type from the P4K file path so DB values mirror the game taxonomy.

      // Reclassify FPS ammo/rocket entities as Ammunition (not ship missiles)
      if (comp.type !== 'Ammunition') {
        const isShipMissileClass = /^(?:g?misl_s\d+_|bomb_s\d+_)/i.test(className);
        const looksLikeBallisticAmmo =
          (lcName.includes('ballistic') && (lcName.includes('mag') || lcName.includes('ammo'))) || lcName.includes('bullet');
        const looksLikeAmmoEntity =
          fn.includes('/fps/') || fn.includes('\\fps\\') || (looksLikeBallisticAmmo && !lcName.includes('launcher'));
        if ((comp.type === 'Missile' || comp.type === 'WeaponGun') && looksLikeAmmoEntity && !isShipMissileClass) {
          comp.type = 'Ammunition';
        }
      }

      // Reclassify mining lasers — in 4.x they live under /ships/weapons/ so they match WeaponGun
      if (comp.type === 'WeaponGun' && /^Mining_Laser_/i.test(className)) {
        comp.type = 'MiningLaser';
        // Derive mining stats from already-extracted beam weapon fields
        if (comp.weaponBeamDps && !comp.miningSpeed) comp.miningSpeed = comp.weaponBeamDps;
        if (comp.weaponFullDamageRange && !comp.miningRange) comp.miningRange = comp.weaponFullDamageRange;
      }

      // Reclassify tractor beams — in 4.x they live under /weapons/ so they match WeaponGun
      if (comp.type === 'WeaponGun' && /TractorBeam/i.test(className) && !lcName.startsWith('aegs')) {
        comp.type = 'TractorBeam';
      }

      // Mining arms (miningarm/ path) are physical mounts with no stats — skip
      if (comp.type === 'MiningLaser' && fn.includes('miningarm')) continue;

      // Mining modules (miningsubitems/ path) are consumable modifiers, not lasers
      if (comp.type === 'MiningLaser' && /mining(?:sub)?items|mining_?(?:gadgets?|modules?|modifiers?)/i.test(fn)) {
        comp.type = 'MiningModifier';
      }

      // Tractor beam arms are physical mounts — real beam stats are on the sub-item — skip
      if (comp.type === 'TractorBeam' && /(?:tractor_?beam_?arm|_?arm$)/i.test(className)) continue;

      // Keep Gimbal category clean: remove known non-gimbal mounts/turrets
      if (
        comp.type === 'Gimbal' &&
        (/(?:^|_)(camera|turret)(?:_|$)/i.test(className) ||
          className.toLowerCase().includes('salvage') ||
          className.toLowerCase().includes('tractor'))
      ) {
        continue;
      }

      // FuelTank: distinguish Quantum vs Hydrogen reservoirs
      if (comp.type === 'FuelTank' && !comp.subType) {
        comp.subType = fn.includes('quantum') ? 'Quantum' : 'Hydrogen';
      }

      // QuantumDrive: detect jump drives (4.x uses a dedicated sub-path / class name)
      if (comp.type === 'QuantumDrive' && !comp.subType) {
        comp.subType = fn.includes('jump') || lcName.includes('jump') ? 'Jump' : 'Standard';
      }

      // Thruster: promote thrusterType → subType for P4K consistency
      if (comp.type === 'Thruster' && !comp.subType && comp.thrusterType) {
        comp.subType = comp.thrusterType; // 'Main' | 'Maneuvering' | 'Retro' | 'VTOL'
      }

      // Gimbal: keep only real gimbals in this type
      if (comp.type === 'Gimbal' && !comp.subType) {
        comp.subType = 'Gimbal';
      }

      // WeaponGun: sub_type is the weapon family; damage stays in weapon_damage_type.
      if (comp.type === 'WeaponGun') {
        const weaponText = `${className} ${comp.name || ''}`.toLowerCase();
        if (weaponText.includes('scatter') || weaponText.includes('shotgun')) comp.subType = 'Scattergun';
        else if (weaponText.includes('gatling')) comp.subType = 'Gatling';
        else if (weaponText.includes('repeater')) comp.subType = 'Repeater';
        else if (weaponText.includes('cannon')) comp.subType = 'Cannon';
        else if (weaponText.includes('beam')) comp.subType = 'Beam';
        if (weaponText.includes('tachyon')) comp.weaponDamageType = 'Tachyon';
        else if (weaponText.includes('plasma')) comp.weaponDamageType = 'Plasma';
        else if (comp.weaponDamageType === 'physical') comp.weaponDamageType = 'Ballistic';
        else if (comp.weaponDamageType === 'energy') comp.weaponDamageType = 'Laser';
        else if (comp.weaponDamageType === 'distortion') comp.weaponDamageType = 'Distortion';
        else if (comp.weaponDamageType === 'thermal') comp.weaponDamageType = 'Plasma';
      }

      if (!comp.componentClass) comp.componentClass = inferComponentClass(comp.className, comp.name);
      comp.isBespoke = inferIsBespokeComponent(comp.className, comp.name);

      if (comp.type === 'MissileRack' && !comp.subType) {
        const rackText = `${className} ${comp.name || ''}`.toLowerCase();
        if (rackText.includes('rocket')) comp.subType = 'Rocket';
        else if (rackText.includes('torpedo')) comp.subType = 'Torpedo';
        else if (rackText.includes('bomb')) comp.subType = 'Bomb';
        else comp.subType = 'Missile';
      }

      // Missile: tag torpedoes and bombs from class_name / resolved display name
      if (comp.type === 'Missile' && !comp.subType) {
        const lcDispName = (comp.name || '').toLowerCase();
        if (lcName.includes('rocket') || lcDispName.includes('rocket')) comp.subType = 'Rocket';
        else if (lcName.startsWith('bomb_') || lcDispName.includes(' bomb')) comp.subType = 'Bomb';
        else if (lcDispName.includes('torpedo') || /^misl_s(?:09|10|11|12)_/i.test(className)) comp.subType = 'Torpedo';
        else comp.subType = 'Missile';
      }

      // Manufacturer fallback: try to match className prefix against DataForge manufacturer records.
      // Only assigns if the code is known to be a real manufacturer (in DataForge SCItemManufacturer),
      // to avoid false positives like DOOR_, SEAT_, RACK_, etc.
      if (!comp.manufacturerCode) {
        const mfgMatch = className.match(/^([A-Za-z]{3,6})_/);
        if (mfgMatch) {
          const code = mfgMatch[1].toUpperCase();
          const mfgInfo = [...ctx.extractAllManufacturers().values()].find((m) => m.code === code);
          if (mfgInfo) comp.manufacturerCode = code;
        }
      }

      // Reclassify ship remote turrets as TurretUnmanned (remote-controlled, not physically manned)
      if (comp.type === 'Turret' && lcName.includes('remote')) {
        comp.type = 'TurretUnmanned';
      }
      // Skip world-object/NPC ground defense turrets (class names like "Turret_Automated_*", "Turret_AntiPersonnel_*")
      if (comp.type === 'TurretUnmanned' && /^Turret_/i.test(className)) continue;

      components.push(comp);
    } catch (e) {
      if (scanned % 500 === 0) logger.warn(`Component extraction error at ${scanned}: ${(e as Error).message}`, { module: 'dataforge' });
    }
  }
  logger.info(`Extracted ${components.length} components from ${scanned} SCItem records`, { module: 'dataforge' });
  return components;
}
