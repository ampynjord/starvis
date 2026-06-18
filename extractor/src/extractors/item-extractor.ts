/**
 * Item Extractor — Extracts FPS weapons, personal armor, clothing, attachments,
 * consumables, gadgets, food/drink, and commodity records from DataForge.
 *
 * Produces two separate outputs:
 *   - items[]      → FPS weapons, armor, clothing, attachments, gadgets, consumables
 *   - commodities[] → Tradeable goods (metals, minerals, gas, food, etc.)
 */
import type { DataForgeContext } from '../dataforge/dataforge-utils.js';
import { resolveComponentName } from '../dataforge/dataforge-utils.js';
import logger from '../logger.js';

function mapAttachDefGrade(grade: unknown): string | null {
  if (typeof grade !== 'number' || grade < 1) return null;
  return String.fromCharCode(64 + grade);
}

// ── Type classification helpers ──

interface ItemRecord {
  uuid: string;
  className: string;
  name: string;
  type: string;
  subType: string | null;
  size: number | null;
  grade: string | null;
  manufacturerCode: string | null;
  mass: number | null;
  hp: number | null;
  weaponDamage: number | null;
  weaponDamageType: string | null;
  weaponFireRate: number | null;
  weaponRange: number | null;
  weaponSpeed: number | null;
  weaponAmmoCount: number | null;
  weaponDps: number | null;
  armorDamageReduction: number | null;
  armorTempMin: number | null;
  armorTempMax: number | null;
  dataJson: Record<string, unknown> | null;
}

interface CommodityRecord {
  uuid: string;
  className: string;
  name: string;
  type: string;
  subType: string | null;
  symbol: string | null;
  occupancyScu: number | null;
  dataJson: Record<string, unknown> | null;
}

/** Path patterns for FPS/personal items → item type classification */
const ITEM_PATH_PATTERNS: Array<{ regex: RegExp; type: string; subType?: string }> = [
  // FPS weapons
  { regex: /scitem\/weapons\/fps_weapons\/.*assault/i, type: 'FPS_Weapon', subType: 'Assault Rifle' },
  { regex: /scitem\/weapons\/fps_weapons\/.*sniper/i, type: 'FPS_Weapon', subType: 'Sniper Rifle' },
  { regex: /scitem\/weapons\/fps_weapons\/.*shotgun/i, type: 'FPS_Weapon', subType: 'Shotgun' },
  { regex: /scitem\/weapons\/fps_weapons\/.*smg/i, type: 'FPS_Weapon', subType: 'SMG' },
  { regex: /scitem\/weapons\/fps_weapons\/.*lmg/i, type: 'FPS_Weapon', subType: 'LMG' },
  { regex: /scitem\/weapons\/fps_weapons\/.*pistol/i, type: 'FPS_Weapon', subType: 'Pistol' },
  { regex: /scitem\/weapons\/fps_weapons\/.*launcher/i, type: 'FPS_Weapon', subType: 'Launcher' },
  { regex: /scitem\/weapons\/fps_weapons\//i, type: 'FPS_Weapon' },
  { regex: /scitem\/weapons\/melee\//i, type: 'FPS_Weapon', subType: 'Melee' },
  { regex: /scitem\/weapons\/throwable\//i, type: 'FPS_Weapon', subType: 'Throwable' },
  { regex: /scitem\/weapons\/mines\//i, type: 'FPS_Weapon', subType: 'Mine' },
  // Weapon attachments
  { regex: /scitem\/weapons\/weapon_modifier\//i, type: 'Attachment', subType: 'Weapon Modifier' },
  { regex: /scitem\/weapons\/appearance_modifier\//i, type: 'Attachment', subType: 'Appearance' },
  { regex: /scitem\/weapons\/magazines\//i, type: 'Magazine' },
  // Devices
  { regex: /scitem\/weapons\/devices\//i, type: 'Gadget', subType: 'Device' },
  // Undersuit BEFORE the broad armor pattern (undersuits live under /armor/ in the P4K)
  { regex: /scitem\/characters\/.*undersuit/i, type: 'Undersuit' },
  // Personal armor — unified type 'Armor'; specific sub-type (Helmet/Torso/Arms/Legs)
  // is refined via AttachDef.Type in DataForge (see classifyArmorSubType below).
  { regex: /scitem\/characters\/.*\/armor\//i, type: 'Armor' },
  { regex: /scitem\/characters\/.*\/clothing\//i, type: 'Clothing' },
  // Tools & gadgets from carryables
  { regex: /scitem\/carryables\/1h\/(?:.*tool|.*multitool)/i, type: 'Tool', subType: 'Multitool' },
  { regex: /scitem\/carryables\/1h\/.*module/i, type: 'Tool', subType: 'Module' },
  { regex: /scitem\/carryables\/1h\//i, type: 'Gadget', subType: 'Handheld' },
  { regex: /scitem\/carryables\/2h\//i, type: 'Gadget', subType: 'Two-handed' },
  // Consumables — subType refined from path. Match by folder for better coverage.
  { regex: /scitem\/consumables\/(medical|medpack|medic)/i, type: 'Consumable', subType: 'Medical' },
  { regex: /scitem\/consumables\/(stim|stimulant)/i, type: 'Consumable', subType: 'Stim' },
  { regex: /scitem\/consumables\/(food|meal|recipe)/i, type: 'Consumable', subType: 'Food' },
  { regex: /scitem\/consumables\/(drink|beverage|water|juice|tea|coffee|beer|wine|soda)/i, type: 'Consumable', subType: 'Drink' },
  { regex: /scitem\/consumables\/(oxygen|oxy|o2)/i, type: 'Consumable', subType: 'OxygenCap' },
  { regex: /scitem\/consumables\//i, type: 'Consumable' },
];

/** Classify an item by its DataForge file path */
function classifyItem(filePath: string): { type: string; subType: string | null } | null {
  const fp = filePath.replace(/\\/g, '/').toLowerCase();
  for (const pat of ITEM_PATH_PATTERNS) {
    if (pat.regex.test(fp)) {
      return { type: pat.type, subType: pat.subType || null };
    }
  }
  return null;
}

/** Commodity path patterns */
const COMMODITY_PATHS: Array<{ regex: RegExp; type: string }> = [
  { regex: /commodities\/food\//i, type: 'Food' },
  { regex: /commodities\/drink[s]?\//i, type: 'Drink' },
  { regex: /commodities\/beverage[s]?\//i, type: 'Drink' },
  { regex: /commodities\/minerals?\//i, type: 'Mineral' },
  { regex: /commodities\/metals?\//i, type: 'Metal' },
  { regex: /commodities\/gas\//i, type: 'Gas' },
  { regex: /commodities\/vice\//i, type: 'Vice' },
  { regex: /commodities\/natural\//i, type: 'Natural' },
  { regex: /commodities\/consumergoods\//i, type: 'Consumer Goods' },
  { regex: /commodities\/manmade\//i, type: 'Manmade' },
  { regex: /commodities\/processedgoods\//i, type: 'Processed Goods' },
  { regex: /commodities\/alloy[s]?\//i, type: 'Alloy' },
  { regex: /commodities\/agriculturalsuppl/i, type: 'Agricultural Supply' },
  { regex: /commodities\/halogen[s]?\//i, type: 'Halogen' },
  { regex: /commodities\/counterfeit\//i, type: 'Counterfeit' },
  { regex: /commodities\/medicalsuppl/i, type: 'Medical Supply' },
  { regex: /commodities\/scrap\//i, type: 'Scrap' },
  { regex: /commodities\/mixedmining\//i, type: 'Mixed Mining' },
  { regex: /commodities\/non_metals?\//i, type: 'Nonmetal' },
  { regex: /commodities\/waste\//i, type: 'Waste' },
  { regex: /commodities\/refined\//i, type: 'Refined' },
  { regex: /commodities\/raw\//i, type: 'Raw' },
];

/** Check if path is a commodity */
function classifyCommodity(filePath: string): string | null {
  const fp = filePath.replace(/\\/g, '/').toLowerCase();
  for (const pat of COMMODITY_PATHS) {
    if (pat.regex.test(fp)) return pat.type;
  }
  return null;
}

function normalizeFpsItemClassification(item: ItemRecord, filePath: string): void {
  if (item.type !== 'FPS_Weapon') return;

  const text = `${item.className} ${item.name} ${filePath}`.toLowerCase();
  const isGenericSubType = !item.subType || ['small', 'medium', 'large', 'gadget', 'undefined'].includes(item.subType.toLowerCase());

  if (text.includes('medgun') || text.includes('medical device')) {
    item.type = 'Tool';
    item.subType = 'Medical';
    return;
  }
  if (text.includes('multitool') || text.includes('multi-tool')) {
    item.type = 'Tool';
    item.subType = 'Multitool';
    return;
  }
  if (
    text.includes('tractor') ||
    text.includes('cutter') ||
    text.includes('salvage') ||
    text.includes('repair') ||
    text.includes('fire_extinguisher') ||
    text.includes('fire extinguisher')
  ) {
    item.type = 'Tool';
    item.subType = 'Device';
    return;
  }
  if (text.includes('binocular') || text.includes('monocular') || text.includes('rangefinder')) {
    item.type = 'Gadget';
    item.subType = 'Device';
    return;
  }

  if (!isGenericSubType) return;

  if (text.includes('shotgun')) item.subType = 'Shotgun';
  else if (text.includes('sniper')) item.subType = 'Sniper Rifle';
  else if (text.includes('smg')) item.subType = 'SMG';
  else if (text.includes('lmg')) item.subType = 'LMG';
  else if (text.includes('pistol')) item.subType = 'Pistol';
  else if (text.includes('railgun') || text.includes('launcher') || text.includes('rocket')) item.subType = 'Launcher';
  else if (text.includes('rifle') || text.includes('crossbow')) item.subType = 'Assault Rifle';
}

// ── Skip filters ──

function shouldSkipItem(className: string, filePath = ''): boolean {
  const lc = className.toLowerCase();
  const fp = filePath.replace(/\\/g, '/').toLowerCase();
  return (
    fp.includes('/dev/') ||
    lc.includes('_test') ||
    lc.startsWith('test_') ||
    lc.includes('_debug') ||
    lc.includes('_template') ||
    lc.includes('_indestructible') ||
    lc.includes('_placeholder') ||
    lc.startsWith('display_') ||
    lc.includes('_display_') ||
    lc.includes('_prop_') ||
    lc.endsWith('_prop') ||
    lc.includes('weapon_rack') ||
    lc.includes('weaponrack') ||
    lc.includes('shopdisplay') ||
    lc.includes('shop_display') ||
    lc.includes('ammocrate') ||
    lc.includes('ammo_crate')
  );
}

// ── Main extraction function ──

/**
 * Extract all FPS items and commodities from DataForge.
 */
export function extractItems(ctx: DataForgeContext): { items: ItemRecord[]; commodities: CommodityRecord[] } {
  const dfData = ctx.getDfData();
  if (!dfData) return { items: [], commodities: [] };
  const entityClassIdx = dfData.structDefs.findIndex((s) => s.name === 'EntityClassDefinition');
  if (entityClassIdx === -1) return { items: [], commodities: [] };

  const items: ItemRecord[] = [];
  const commodities: CommodityRecord[] = [];
  let scannedItems = 0;
  let scannedCommodities = 0;

  for (const r of dfData.records) {
    if (r.structIndex !== entityClassIdx) continue;
    const fn = (r.fileName || '').replace(/\\/g, '/').toLowerCase();
    const className = r.name?.replace('EntityClassDefinition.', '') || '';
    if (!className) continue;

    // Try commodity first
    const commType = classifyCommodity(fn);
    if (commType) {
      scannedCommodities++;
      try {
        if (shouldSkipItem(className, fn)) continue;
        const data = ctx.readInstance(r.structIndex, r.instanceIndex, 0, 4);
        if (!data) continue;

        const comm: CommodityRecord = {
          uuid: r.id,
          className,
          name: className.replace(/^Commodities?_/i, '').replace(/_/g, ' '),
          type: commType,
          subType: null,
          symbol: null,
          occupancyScu: null,
          dataJson: { p4kPath: r.fileName || null, rawJson: { record: r, data } },
        };

        if (Array.isArray(data.Components)) {
          for (const c of data.Components) {
            if (!c || typeof c !== 'object') continue;
            const cType = c.__type as string;
            if (cType === 'CommodityComponentParams') {
              if (c.occupancy && typeof c.occupancy === 'object' && typeof c.occupancy.microSCU === 'number') {
                comm.occupancyScu = c.occupancy.microSCU;
              }
            }
            if (cType === 'SCItemPurchasableParams') {
              if (c.displayName && typeof c.displayName === 'string' && !c.displayName.startsWith('@')) {
                comm.name = c.displayName;
              }
            }
            if (cType === 'SAttachableComponentParams') {
              const ad = c.AttachDef;
              if (ad) {
                if (ad.SubType && typeof ad.SubType === 'string') comm.subType = ad.SubType;
                const loc = ad.Localization;
                if (loc?.Name && typeof loc.Name === 'string' && !loc.Name.startsWith('@') && !loc.Name.startsWith('LOC_')) {
                  comm.name = loc.Name;
                }
              }
            }
          }
        }

        commodities.push(comm);
      } catch {
        /* skip */
      }
      continue;
    }

    // Then try items
    const classification = classifyItem(fn);
    if (!classification) continue;
    scannedItems++;

    try {
      if (shouldSkipItem(className, fn)) continue;
      const data = ctx.readInstance(r.structIndex, r.instanceIndex, 0, 4);
      if (!data) continue;
      const comps = data.Components;
      if (!Array.isArray(comps)) continue;

      const item: ItemRecord = {
        uuid: r.id,
        className,
        name: resolveComponentName(className),
        type: classification.type,
        subType: classification.subType,
        size: null,
        grade: null,
        manufacturerCode: null,
        mass: null,
        hp: null,
        weaponDamage: null,
        weaponDamageType: null,
        weaponFireRate: null,
        weaponRange: null,
        weaponSpeed: null,
        weaponAmmoCount: null,
        weaponDps: null,
        armorDamageReduction: null,
        armorTempMin: null,
        armorTempMax: null,
        dataJson: null,
      };

      const extData: Record<string, unknown> = { p4kPath: r.fileName || null, rawJson: { record: r, data } };

      for (const c of comps) {
        if (!c || typeof c !== 'object' || !c.__type) continue;
        const cType = c.__type as string;

        // Attachable info (size, grade, manufacturer, name)
        if (cType === 'SAttachableComponentParams') {
          const ad = c.AttachDef;
          if (ad && typeof ad === 'object') {
            if (typeof ad.Size === 'number') item.size = ad.Size;
            item.grade = mapAttachDefGrade(ad.Grade);
            // Apply AttachDef.Type FIRST (authoritative source), BEFORE subType assignment.
            // The guard `if (!item.subType)` was removed: armor items with a weight subType (Light/Medium/Heavy)
            // were never re-typed because subType was already set when this code ran.
            if (ad.Type && typeof ad.Type === 'string') {
              extData.attachType = ad.Type;
              if (ad.Type === 'Char_Armor_Helmet') item.type = 'Armor_Helmet';
              else if (ad.Type === 'Char_Armor_Torso') item.type = 'Armor_Torso';
              else if (ad.Type === 'Char_Armor_Arms') item.type = 'Armor_Arms';
              else if (ad.Type === 'Char_Armor_Legs') item.type = 'Armor_Legs';
              else if (ad.Type === 'Char_Armor_Backpack') item.type = 'Armor_Backpack';
              else if (
                ad.Type === 'Char_Clothing_Torso' ||
                ad.Type === 'Char_Clothing_Legs' ||
                ad.Type === 'Char_Clothing_Feet' ||
                ad.Type === 'Char_Clothing_Hat' ||
                ad.Type === 'Char_Clothing_Hands' ||
                ad.Type === 'Char_Clothing_Neck'
              )
                item.type = 'Clothing';
              else if (ad.Type === 'Char_Undersuit') item.type = 'Undersuit';
            }
            if (ad.SubType && typeof ad.SubType === 'string') {
              item.subType = item.subType || ad.SubType;
            }
            const loc = ad.Localization;
            if (loc?.Name && typeof loc.Name === 'string') {
              if (!loc.Name.startsWith('LOC_') && !loc.Name.startsWith('@')) {
                item.name = loc.Name;
              }
            }
            if (typeof ad.Manufacturer === 'string' && ad.Manufacturer) {
              extData.manufacturerRef = ad.Manufacturer;
              // Resolve GUID immediately so manufacturer_code is set from game data
              const mfgInfo = ctx.extractAllManufacturers().get(ad.Manufacturer);
              if (mfgInfo) {
                item.manufacturerCode = mfgInfo.code;
              }
            }
          }
        }

        // Mass
        if (cType === 'SEntityPhysicsControllerParams') {
          const pp = c.PhysType;
          if (pp && typeof pp === 'object' && typeof pp.Mass === 'number') {
            item.mass = Math.round(pp.Mass * 100) / 100;
          }
        }

        // HP
        if (cType === 'SHealthComponentParams') {
          if (typeof c.Health === 'number' && c.Health > 0) item.hp = Math.round(c.Health);
        }

        // FPS weapon stats
        if (cType === 'SCItemWeaponComponentParams') {
          const fireActions = c.fireActions;
          if (Array.isArray(fireActions) && fireActions.length > 0) {
            for (const pa of fireActions) {
              if (!pa || typeof pa !== 'object') continue;
              if (typeof pa.fireRate === 'number' && !item.weaponFireRate) item.weaponFireRate = Math.round(pa.fireRate * 100) / 100;
              if (typeof pa.heatPerShot === 'number') extData.weaponHeatPerShot = Math.round(pa.heatPerShot * 100000) / 100000;
              // Store pellet count for shotgun calculations
              const pellets = pa.launchParams?.pelletCount ?? pa.launchParams?.SProjectileLauncher?.pelletCount;
              if (typeof pellets === 'number' && pellets > 1) extData.pelletCount = pellets;
            }
          }
        }

        // Resolve ammo damage via weapon default loadout → magazine → ammo
        // NOTE: we store the loadout component for post-processing AFTER the loop
        // so that SAmmoContainerComponentParams (direct on weapon) takes priority
        if (cType === 'SEntityComponentDefaultLoadoutParams' && item.type === 'FPS_Weapon') {
          extData._defaultLoadoutEntries = c.loadout?.entries;
        }

        // Ammo / damage (fallback via magazine SAmmoContainerComponentParams)
        if (cType === 'SAmmoContainerComponentParams') {
          if (typeof c.maxAmmoCount === 'number') item.weaponAmmoCount = c.maxAmmoCount;
          if (typeof c.initialAmmoCount === 'number' && !item.weaponAmmoCount) item.weaponAmmoCount = c.initialAmmoCount;

          // Only resolve ammo damage if not already found via fireActions
          if (!item.weaponDamage) {
            const ammoGuid = c.ammoParamsRecord?.__ref;
            if (ammoGuid) {
              try {
                const ammoData = ctx.readRecordByGuid(ammoGuid, 5);
                if (ammoData) {
                  if (typeof ammoData.speed === 'number' && !item.weaponSpeed) item.weaponSpeed = Math.round(ammoData.speed * 100) / 100;
                  if (typeof ammoData.lifetime === 'number' && item.weaponSpeed && !item.weaponRange) {
                    item.weaponRange = Math.round(ammoData.lifetime * item.weaponSpeed * 100) / 100;
                  }
                  const pp = ammoData.projectileParams;
                  if (pp?.damage) {
                    const dmg = pp.damage;
                    const physical = typeof dmg.DamagePhysical === 'number' ? dmg.DamagePhysical : 0;
                    const energy = typeof dmg.DamageEnergy === 'number' ? dmg.DamageEnergy : 0;
                    const distortion = typeof dmg.DamageDistortion === 'number' ? dmg.DamageDistortion : 0;
                    const total = physical + energy + distortion;
                    if (total > 0) {
                      item.weaponDamage = Math.round(total * 10000) / 10000;
                      item.weaponDamageType =
                        physical >= energy && physical >= distortion ? 'physical' : energy >= distortion ? 'energy' : 'distortion';
                      extData.damagePhysical = Math.round(physical * 10000) / 10000;
                      extData.damageEnergy = Math.round(energy * 10000) / 10000;
                      extData.damageDistortion = Math.round(distortion * 10000) / 10000;
                    }
                  }
                }
              } catch {
                /* non-critical */
              }
            }
          }
        }

        // Armor damage resistance — damageResistance is a GUID ref to DamageResistanceMacro
        if (cType === 'SCItemSuitArmorParams') {
          const drRef = (c.damageResistance as Record<string, unknown>)?.__ref as string | undefined;
          if (drRef && drRef !== '00000000-0000-0000-0000-000000000000') {
            try {
              const drData = ctx.readRecordByGuid(drRef, 5);
              const dr = drData?.damageResistance as Record<string, Record<string, number>> | undefined;
              if (dr) {
                const physical = dr.PhysicalResistance?.Multiplier;
                const energy = dr.EnergyResistance?.Multiplier;
                const distortion = dr.DistortionResistance?.Multiplier;
                const thermal = dr.ThermalResistance?.Multiplier;
                const biochemical = dr.BiochemicalResistance?.Multiplier;
                const stun = dr.StunResistance?.Multiplier;
                if (typeof physical === 'number') {
                  item.armorDamageReduction = Math.round((1 - physical) * 10000) / 10000;
                }
                // Store full breakdown in data_json
                const breakdown: Record<string, number> = {};
                if (typeof physical === 'number') breakdown.drPhysical = Math.round((1 - physical) * 10000) / 10000;
                if (typeof energy === 'number') breakdown.drEnergy = Math.round((1 - energy) * 10000) / 10000;
                if (typeof distortion === 'number') breakdown.drDistortion = Math.round((1 - distortion) * 10000) / 10000;
                if (typeof thermal === 'number') breakdown.drThermal = Math.round((1 - thermal) * 10000) / 10000;
                if (typeof biochemical === 'number') breakdown.drBiochemical = Math.round((1 - biochemical) * 10000) / 10000;
                if (typeof stun === 'number') breakdown.drStun = Math.round((1 - stun) * 10000) / 10000;
                if (Object.keys(breakdown).length > 0) Object.assign(extData, breakdown);
              }
            } catch {
              /* non-critical */
            }
          }
        }

        // Temperature + radiation resistance (capital T — SCItemClothingTemperatureResistanceParams)
        if (cType === 'SCItemClothingParams') {
          const tr = c.TemperatureResistance as Record<string, number> | undefined;
          if (tr && typeof tr.MinResistance === 'number') item.armorTempMin = tr.MinResistance;
          if (tr && typeof tr.MaxResistance === 'number') item.armorTempMax = tr.MaxResistance;
        }

        // Purchasable info
        if (cType === 'SCItemPurchasableParams') {
          if (c.displayName && typeof c.displayName === 'string' && !c.displayName.startsWith('@')) {
            item.name = c.displayName;
          }
        }
      }

      // Post-processing: resolve FPS weapon damage via default loadout → magazine → ammo
      // (Fallback only if SAmmoContainerComponentParams on weapon itself gave no damage)
      if (!item.weaponDamage && item.type === 'FPS_Weapon' && extData._defaultLoadoutEntries) {
        const entries = extData._defaultLoadoutEntries as Array<Record<string, unknown>>;
        for (const se of entries) {
          if (!se || typeof se !== 'object') continue;
          const portName = (se.itemPortName || se.portName || '').toString().toLowerCase();
          if (!portName.includes('ammo') && !portName.includes('magazine') && !portName.includes('clip')) continue;
          let magClassName = (se.entityClassName as string) || '';
          if (!magClassName && (se.entityClassReference as any)?.__ref) {
            magClassName = ctx.resolveGuid((se.entityClassReference as any).__ref) || '';
          }
          if (!magClassName) continue;
          try {
            const magRecord = ctx.findEntityRecord(magClassName);
            if (!magRecord) continue;
            const magData = ctx.readInstance(magRecord.structIndex, magRecord.instanceIndex, 0, 4);
            if (!magData?.Components) continue;
            for (const mc of magData.Components) {
              if (!mc || mc.__type !== 'SAmmoContainerComponentParams') continue;
              if (typeof mc.maxAmmoCount === 'number' && !item.weaponAmmoCount) item.weaponAmmoCount = mc.maxAmmoCount;
              const ammoGuid = mc.ammoParamsRecord?.__ref;
              if (!ammoGuid) continue;
              try {
                const ammoData = ctx.readRecordByGuid(ammoGuid, 5);
                if (!ammoData) continue;
                if (typeof ammoData.speed === 'number' && !item.weaponSpeed) item.weaponSpeed = Math.round(ammoData.speed * 100) / 100;
                if (typeof ammoData.lifetime === 'number' && item.weaponSpeed && !item.weaponRange)
                  item.weaponRange = Math.round(ammoData.lifetime * item.weaponSpeed * 100) / 100;
                const pp = ammoData.projectileParams;
                if (pp?.damage) {
                  const dmg = pp.damage;
                  const physical = typeof dmg.DamagePhysical === 'number' ? dmg.DamagePhysical : 0;
                  const energy = typeof dmg.DamageEnergy === 'number' ? dmg.DamageEnergy : 0;
                  const distortion = typeof dmg.DamageDistortion === 'number' ? dmg.DamageDistortion : 0;
                  const pellets = Number(extData.pelletCount ?? 1);
                  const total = (physical + energy + distortion) * pellets;
                  if (total > 0) {
                    item.weaponDamage = Math.round(total * 10000) / 10000;
                    item.weaponDamageType =
                      physical >= energy && physical >= distortion ? 'physical' : energy >= distortion ? 'energy' : 'distortion';
                    extData.damagePhysical = Math.round(physical * pellets * 10000) / 10000;
                    extData.damageEnergy = Math.round(energy * pellets * 10000) / 10000;
                    extData.damageDistortion = Math.round(distortion * pellets * 10000) / 10000;
                  }
                }
              } catch {
                /* non-critical */
              }
              break;
            }
          } catch {
            /* non-critical */
          }
          if (item.weaponDamage) break;
        }
        delete extData._defaultLoadoutEntries;
      }

      // Compute DPS — cap at DECIMAL(10,4) max of 999999.9999
      if (item.weaponDamage && item.weaponFireRate) {
        const rawDps = item.weaponDamage * (item.weaponFireRate / 60);
        item.weaponDps = rawDps < 999999 ? Math.round(rawDps * 10000) / 10000 : null;
      }

      // Refine Gadget/Handheld carryables that are actually Food or Drink
      // using the AttachDef.Type from DataForge (already stored in extData.attachType)
      if (item.type === 'Gadget' && item.subType === 'Handheld') {
        if (extData.attachType === 'Food') {
          item.type = 'Consumable';
          item.subType = 'Food';
        } else if (extData.attachType === 'Drink') {
          item.type = 'Consumable';
          item.subType = 'Drink';
        }
      }

      // Fallback: Consumable items with null subType should attempt to infer from path or attachType
      // to ensure Food/Drink items are not accidentally included in Tools & Medics category
      if (item.type === 'Consumable' && !item.subType && extData.attachType && typeof extData.attachType === 'string') {
        const attachTypeStr = String(extData.attachType).toLowerCase();
        if (attachTypeStr.includes('food')) item.subType = 'Food';
        else if (attachTypeStr.includes('drink') || attachTypeStr.includes('beverage')) item.subType = 'Drink';
        else if (attachTypeStr.includes('medical') || attachTypeStr.includes('medic')) item.subType = 'Medical';
        else if (attachTypeStr.includes('stim')) item.subType = 'Stim';
        else if (attachTypeStr.includes('oxygen') || attachTypeStr.includes('o2')) item.subType = 'OxygenCap';
      }

      normalizeFpsItemClassification(item, fn);

      // Manufacturer fallback: try to match className prefix against DataForge manufacturer records.
      // Only assigns if the code is known to be a real manufacturer (in DataForge SCItemManufacturer),
      // to avoid false positives like DOOR_, SEAT_, RACK_, etc.
      if (!item.manufacturerCode) {
        const mfgMatch = className.match(/^([A-Za-z]{3,6})_/);
        if (mfgMatch) {
          const code = mfgMatch[1].toUpperCase();
          const mfgInfo = [...ctx.extractAllManufacturers().values()].find((m) => m.code === code);
          if (mfgInfo) item.manufacturerCode = code;
        }
      }

      // Store extended data if any
      if (Object.keys(extData).length > 0) item.dataJson = extData;

      items.push(item);
    } catch (e) {
      if (scannedItems % 500 === 0) {
        logger.warn(`Item extraction error at ${scannedItems}: ${(e as Error).message}`, { module: 'dataforge' });
      }
    }
  }

  logger.info(
    `Extracted ${items.length} items from ${scannedItems} records, ${commodities.length} commodities from ${scannedCommodities} records`,
    { module: 'dataforge' },
  );
  return { items, commodities };
}
