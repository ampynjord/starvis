/**
 * Component Extractor — Extracts ship components (weapons, shields, etc.) from DataForge
 *
 * Extracted from DataForgeService.extractAllComponents() to reduce god-class size.
 * Depends on DataForgeContext interface (no circular dependency with DataForgeService).
 */
import type { DataForgeContext } from "./dataforge-utils.js";
import { MANUFACTURER_CODES, resolveComponentName } from "./dataforge-utils.js";
import logger from "./logger.js";

/**
 * Extract all ship components from DataForge SCItem records.
 * Scans EntityClassDefinition records in weapon/system paths and resolves
 * component stats (damage, shield HP, power, cooler rate, QD speed, etc.).
 */
export function extractAllComponents(ctx: DataForgeContext): any[] {
  const dfData = ctx.getDfData();
  if (!dfData) return [];
  const entityClassIdx = dfData.structDefs.findIndex(s => s.name === 'EntityClassDefinition');
  if (entityClassIdx === -1) return [];

  const components: any[] = [];

  const componentPaths: Record<string, RegExp> = {
    'WeaponGun':     /scitem.*weapons\/[^\/\\]+$/i,
    'Shield':        /shield_?generator[s]?[\/\\]|shield[s]?[\/\\]/i,
    'PowerPlant':    /power_?plant[s]?[\/\\]|powerplant/i,
    'Cooler':        /cooler[s]?[\/\\]/i,
    'QuantumDrive':  /quantum_?drive[s]?[\/\\]|quantumdrive/i,
    'Missile':       /missile[s]?[\/\\](?!rack|launcher|_rack)/i,
    'Thruster':      /thruster[s]?[\/\\]/i,
    'Radar':         /radar[s]?[\/\\]/i,
    'Countermeasure': /countermeasure[s]?[\/\\]|flare[s]?[\/\\]|noise[\/\\]/i,
    'FuelIntake':    /fuel_?intake[s]?[\/\\]/i,
    'FuelTank':      /fuel_?tank[s]?[\/\\](?!quantum)/i,
    'LifeSupport':   /life_?support[s]?[\/\\]/i,
    'EMP':           /emp[\/\\]|distortion_?charge[\/\\]|emp_?generator/i,
    'QuantumInterdictionGenerator': /quantum_?interdiction[\/\\]|qig[\/\\]|quantum_?enforcement/i,
    'Gimbal':        /weapon_mounts\/gimbal[\/\\]|mount_?fixed[\/\\]/i,
    'Turret':        /ships\/turret[\/\\](?!.*unmanned)/i,
    'TurretUnmanned': /turret_?unmanned[\/\\]/i,
    'MissileRack':   /missile_?racks?[\/\\]/i,
    'MiningLaser':   /utility\/mining\/miningarm[\/\\]|mining_?laser[\/\\]|miningsubitems[\/\\]/i,
    'SalvageHead':   /utility\/salvage\/salvagehead[\/\\]/i,
    'SelfDestruct':  /ships\/selfdestruct[\/\\]/i,
    'TractorBeam':   /utility\/tractorbeam[\/\\]/i,
  };

  let scanned = 0;
  for (const r of dfData.records) {
    if (r.structIndex !== entityClassIdx) continue;
    const fn = (r.fileName || '').toLowerCase();
    if (!fn.includes('scitem/ships/') && !fn.includes('scitem') && !fn.includes('/weapon/') && !fn.includes('/missile/') && !fn.includes('/systems/')) continue;
    let type: string | null = null;
    for (const [t, rx] of Object.entries(componentPaths)) { if (rx.test(fn)) { type = t; break; } }
    if (!type) continue;
    scanned++;
    try {
      const data = ctx.readInstance(r.structIndex, r.instanceIndex, 0, 4);
      if (!data) continue;
      const className = r.name?.replace('EntityClassDefinition.', '') || '';
      if (!className) continue;
      const lcName = className.toLowerCase();
      if (lcName.includes('_test') || lcName.startsWith('test_') ||
          lcName.includes('_debug') || lcName.includes('_template') ||
          lcName.includes('_indestructible') || lcName.includes('_npc_only') ||
          lcName.includes('_placeholder') || lcName.includes('contestedzonereward') ||
          lcName.startsWith('display_')) continue;

      // Skip FPS weapons (personal weapons, not ship components)
      if (type === 'WeaponGun') {
        const isFpsWeapon = /(?:^|\b|_)(rifles?|pistols?|smg|shotgun|sniper|multitool|lmg|grenade_launcher)(?:_|\b|$)/i.test(lcName);
        if (isFpsWeapon) continue;
      }

      const comp: any = { uuid: r.id, className, name: className.replace(/_/g, ' '), type };
      const comps = data.Components;
      if (!Array.isArray(comps)) continue;

      for (const c of comps) {
        if (!c || typeof c !== 'object' || !c.__type) continue;
        const cType = c.__type as string;

        if (cType === 'SAttachableComponentParams') {
          const ad = c.AttachDef;
          if (ad && typeof ad === 'object') {
            if (typeof ad.Size === 'number') comp.size = ad.Size;
            if (typeof ad.Grade === 'number') comp.grade = String.fromCharCode(65 + ad.Grade);
            const loc = ad.Localization;
            if (loc?.Name && typeof loc.Name === 'string') {
              if (!loc.Name.startsWith('LOC_') && !loc.Name.startsWith('@')) {
                comp.name = loc.Name;
              } else {
                comp.name = resolveComponentName(className);
              }
            }
            if (typeof ad.Manufacturer === 'string' && ad.Manufacturer) comp.manufacturer = ad.Manufacturer;
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

        // Weapon fire rate
        if (cType === 'SCItemWeaponComponentParams') {
          const fireActions = c.fireActions;
          if (Array.isArray(fireActions) && fireActions.length > 0) {
            const pa = fireActions[0];
            if (pa && typeof pa === 'object') {
              if (typeof pa.fireRate === 'number') comp.weaponFireRate = Math.round(pa.fireRate * 100) / 100;
              if (typeof pa.heatPerShot === 'number') comp.weaponHeatPerShot = Math.round(pa.heatPerShot * 100000) / 100000;
              const lp = pa.launchParams;
              if (lp && typeof lp === 'object') {
                if (typeof lp.pelletCount === 'number') comp.weaponPelletsPerShot = lp.pelletCount;
              }
              if (!comp.weaponFireRate && Array.isArray(pa.sequenceEntries)) {
                let totalFR = 0;
                for (const se of pa.sequenceEntries) {
                  const wa = se?.weaponAction;
                  if (wa && typeof wa.fireRate === 'number') totalFR += wa.fireRate;
                  if (!comp.weaponHeatPerShot && typeof wa?.heatPerShot === 'number') comp.weaponHeatPerShot = Math.round(wa.heatPerShot * 100000) / 100000;
                  if (!comp.weaponPelletsPerShot && wa?.launchParams?.pelletCount) comp.weaponPelletsPerShot = wa.launchParams.pelletCount;
                }
                if (totalFR > 0) comp.weaponFireRate = Math.round(totalFR * 100) / 100;
              }
            }
          }
          if (c.weaponAction && typeof c.weaponAction === 'object' && !comp.weaponFireRate) {
            if (typeof c.weaponAction.fireRate === 'number') comp.weaponFireRate = Math.round(c.weaponAction.fireRate * 100) / 100;
          }
        }

        if (cType === 'SCItemWeaponGunParams' || cType === 'SCItemGunParams') {
          if (typeof c.ammoContainerRecord === 'string') {
            if (c.ammoContainerRecord.toLowerCase().includes('ballistic')) comp.subType = 'Ballistic';
            else if (c.ammoContainerRecord.toLowerCase().includes('energy')) comp.subType = 'Energy';
            else if (c.ammoContainerRecord.toLowerCase().includes('distortion')) comp.subType = 'Distortion';
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
                if (typeof ammoData.lifetime === 'number' && comp.weaponSpeed) comp.weaponRange = Math.round(ammoData.lifetime * comp.weaponSpeed * 100) / 100;

                const pp = ammoData.projectileParams;
                if (pp && typeof pp === 'object') {
                  const dmg = pp.damage;
                  let physical = 0, energy = 0, distortion = 0, thermal = 0, biochemical = 0, stun = 0;
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
                    comp.weaponDamagePhysical = Math.round(physical * 10000) / 10000;
                    comp.weaponDamageEnergy = Math.round(energy * 10000) / 10000;
                    comp.weaponDamageDistortion = Math.round(distortion * 10000) / 10000;
                    comp.weaponDamageThermal = Math.round(thermal * 10000) / 10000;
                    comp.weaponDamageBiochemical = Math.round(biochemical * 10000) / 10000;
                    comp.weaponDamageStun = Math.round(stun * 10000) / 10000;
                    const dtypes: [string, number][] = [['physical', physical], ['energy', energy], ['distortion', distortion], ['thermal', thermal], ['biochemical', biochemical], ['stun', stun]];
                    comp.weaponDamageType = dtypes.sort((a, b) => b[1] - a[1])[0][0];
                  }

                  if (typeof pp.speed === 'number' && !comp.weaponSpeed) comp.weaponSpeed = Math.round(pp.speed * 100) / 100;
                  if (typeof pp.lifetime === 'number' && comp.weaponSpeed && !comp.weaponRange) comp.weaponRange = Math.round(pp.lifetime * comp.weaponSpeed * 100) / 100;
                }
              }
            } catch (e) { /* ammo resolution — non-critical */ }
          }
        }

        // Shield
        if (cType === 'SCItemShieldGeneratorParams') {
          if (typeof c.MaxShieldHealth === 'number') comp.shieldHp = Math.round(c.MaxShieldHealth * 100) / 100;
          if (typeof c.MaxShieldRegen === 'number') comp.shieldRegen = Math.round(c.MaxShieldRegen * 10000) / 10000;
          if (typeof c.DamagedRegenDelay === 'number') comp.shieldRegenDelay = Math.round(c.DamagedRegenDelay * 100) / 100;
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
            if (typeof jp.Stage1AccelerationRate === 'number' && !comp.qdStage1Accel) comp.qdStage1Accel = Math.round(jp.Stage1AccelerationRate * 100) / 100;
            if (typeof jp.Stage2AccelerationRate === 'number' && !comp.qdStage2Accel) comp.qdStage2Accel = Math.round(jp.Stage2AccelerationRate * 100) / 100;
          }
          const sjp = c.splineJumpParams || c.SplineJumpParams;
          if (sjp && typeof sjp === 'object') {
            if (typeof sjp.driveSpeed === 'number') comp.qdTuningRate = Math.round(sjp.driveSpeed * 100) / 100;
            if (typeof sjp.stageOneAccelRate === 'number') comp.qdAlignmentRate = Math.round(sjp.stageOneAccelRate * 100) / 100;
          }
        }

        // Missile
        if (cType === 'SCItemMissileParams') {
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
                comp.missileDamagePhysical = Math.round(physical * 100) / 100;
                comp.missileDamageEnergy = Math.round(energy * 100) / 100;
                comp.missileDamageDistortion = Math.round(distortion * 100) / 100;
              }
            }
          }
          const gcs = c.GCSParams;
          if (gcs && typeof gcs === 'object') {
            if (typeof gcs.linearSpeed === 'number') comp.missileSpeed = Math.round(gcs.linearSpeed * 100) / 100;
          }
          const tp = c.targetingParams;
          if (tp && typeof tp === 'object') {
            if (typeof tp.lockTime === 'number') comp.missileLockTime = Math.round(tp.lockTime * 100) / 100;
            if (typeof tp.trackingSignalType === 'string') comp.missileSignalType = tp.trackingSignalType;
            if (typeof tp.lockRangeMax === 'number') comp.missileLockRange = Math.round(tp.lockRangeMax * 100) / 100;
            if (typeof tp.lockRangeMin === 'number') comp.missileRange = Math.round(tp.lockRangeMin * 100) / 100;
          }
        }

        // Projectile params
        if (cType === 'SProjectile' || cType === 'SCItemProjectileParams') {
          const bDmg = c.bulletImpactDamage || c.damage;
          if (bDmg && typeof bDmg === 'object') {
            const dt = Object.entries(bDmg).find(([k, v]) => typeof v === 'number' && (v as number) > 0);
            if (dt) { comp.weaponDamage = Math.round(dt[1] as number * 10000) / 10000; comp.weaponDamageType = dt[0]; }
          }
          if (typeof c.speed === 'number' && !comp.weaponSpeed) comp.weaponSpeed = Math.round(c.speed * 100) / 100;
          if (typeof c.lifetime === 'number' && comp.weaponSpeed) comp.weaponRange = Math.round(c.lifetime * comp.weaponSpeed * 100) / 100;
        }

        // Thruster
        if (cType === 'SCItemThrusterParams' || cType === 'SItemThrusterParams') {
          if (typeof c.thrustCapacity === 'number') comp.thrusterMaxThrust = Math.round(c.thrustCapacity * 100) / 100;
          if (typeof c.ThrustCapacity === 'number' && !comp.thrusterMaxThrust) comp.thrusterMaxThrust = Math.round(c.ThrustCapacity * 100) / 100;
          if (typeof c.maxThrustForce === 'number' && !comp.thrusterMaxThrust) comp.thrusterMaxThrust = Math.round(c.maxThrustForce * 100) / 100;
          const thrusterType = fn.includes('main') || fn.includes('retro') ? (fn.includes('retro') ? 'Retro' : 'Main') :
            fn.includes('vtol') ? 'VTOL' : fn.includes('mav') || fn.includes('maneuver') ? 'Maneuvering' : 'Main';
          comp.thrusterType = thrusterType;
        }

        // Radar
        if (cType === 'SCItemRadarComponentParams' || cType === 'SRadarComponentParams') {
          const sigDet = c.signatureDetection;
          if (Array.isArray(sigDet) && sigDet.length > 0) {
            const activeSensitivities = sigDet.filter((s: any) => s?.permitPassiveDetection === true && typeof s?.sensitivity === 'number');
            if (activeSensitivities.length > 0) {
              const avgSensitivity = activeSensitivities.reduce((sum: number, s: any) => sum + s.sensitivity, 0) / activeSensitivities.length;
              comp.radarTrackingSignal = Math.round(avgSensitivity * 10000) / 10000;
            }
            const piercingValues = sigDet.filter((s: any) => typeof s?.piercing === 'number').map((s: any) => s.piercing);
            if (piercingValues.length > 0) {
              comp.radarDetectionLifetime = Math.round(Math.max(...piercingValues) * 10000) / 10000;
            }
          }
          if (c.pingProperties && typeof c.pingProperties.cooldownTime === 'number') {
            comp.radarRange = c.pingProperties.cooldownTime;
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

        // Fuel Tank
        if (cType === 'SCItemFuelTankParams') {
          if (typeof c.capacity === 'number') comp.fuelCapacity = Math.round(c.capacity * 100) / 100;
        }
        if (type === 'FuelTank' && cType === 'ResourceContainer') {
          const cap = typeof c.capacity === 'object' ? (c.capacity?.standardCargoUnits || 0) : (typeof c.capacity === 'number' ? c.capacity : 0);
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

        // Mining laser
        if (cType === 'SCItemMiningLaserParams' || cType === 'SMiningLaserParams') {
          if (typeof c.miningExtractionLaserPower === 'number') comp.miningSpeed = Math.round(c.miningExtractionLaserPower * 10000) / 10000;
          if (typeof c.MiningExtractionLaserPower === 'number' && !comp.miningSpeed) comp.miningSpeed = Math.round(c.MiningExtractionLaserPower * 10000) / 10000;
          if (typeof c.laserInstability === 'number') comp.miningInstability = Math.round(c.laserInstability * 10000) / 10000;
          if (typeof c.LaserInstability === 'number' && !comp.miningInstability) comp.miningInstability = Math.round(c.LaserInstability * 10000) / 10000;
          if (typeof c.resistanceModifier === 'number') comp.miningResistance = Math.round(c.resistanceModifier * 10000) / 10000;
          if (typeof c.optimalRange === 'number') comp.miningRange = Math.round(c.optimalRange * 100) / 100;
          if (typeof c.OptimalRange === 'number' && !comp.miningRange) comp.miningRange = Math.round(c.OptimalRange * 100) / 100;
        }

        // Tractor beam
        if (cType === 'SCItemTractorBeamParams' || cType === 'STractorBeamParams') {
          if (typeof c.maxForce === 'number') comp.tractorMaxForce = Math.round(c.maxForce * 100) / 100;
          if (typeof c.MaxForce === 'number' && !comp.tractorMaxForce) comp.tractorMaxForce = Math.round(c.MaxForce * 100) / 100;
          if (typeof c.maxRange === 'number') comp.tractorMaxRange = Math.round(c.maxRange * 100) / 100;
          if (typeof c.MaxRange === 'number' && !comp.tractorMaxRange) comp.tractorMaxRange = Math.round(c.MaxRange * 100) / 100;
        }

        // Salvage
        if (cType === 'SCItemSalvageParams' || cType === 'SSalvageParams' || cType === 'SCItemSalvageModifierParams') {
          if (typeof c.salvageSpeed === 'number') comp.salvageSpeed = Math.round(c.salvageSpeed * 10000) / 10000;
          if (typeof c.SalvageSpeed === 'number' && !comp.salvageSpeed) comp.salvageSpeed = Math.round(c.SalvageSpeed * 10000) / 10000;
          if (typeof c.radius === 'number') comp.salvageRadius = Math.round(c.radius * 100) / 100;
          if (typeof c.Radius === 'number' && !comp.salvageRadius) comp.salvageRadius = Math.round(c.Radius * 100) / 100;
        }

        // Gimbal / mount type detection
        if (type === 'Gimbal') {
          if (fn.includes('gimbal')) comp.gimbalType = 'Gimbal';
          else if (fn.includes('fixed')) comp.gimbalType = 'Fixed';
          else comp.gimbalType = 'Gimbal';
        }

        // Missile rack: count sub-ports
        if ((type === 'MissileRack') && cType === 'SItemPortContainerComponentParams') {
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

      // Manufacturer from className prefix
      if (!comp.manufacturerCode) {
        const mfgMatch = className.match(/^([A-Z]{3,5})_/);
        if (mfgMatch) { comp.manufacturerCode = mfgMatch[1]; comp.manufacturer = MANUFACTURER_CODES[mfgMatch[1]] || mfgMatch[1]; }
      }

      components.push(comp);
    } catch (e) {
      if (scanned % 500 === 0) logger.warn(`Component extraction error at ${scanned}: ${(e as Error).message}`, { module: 'dataforge' });
    }
  }
  logger.info(`Extracted ${components.length} components from ${scanned} SCItem records`, { module: 'dataforge' });
  return components;
}
