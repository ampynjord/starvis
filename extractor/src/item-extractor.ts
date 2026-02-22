/**
 * Item Extractor — Extracts FPS weapons, personal armor, clothing, attachments,
 * consumables, gadgets, food/drink, and commodity records from DataForge.
 *
 * Produces two separate outputs:
 *   - items[]      → FPS weapons, armor, clothing, attachments, gadgets, consumables
 *   - commodities[] → Tradeable goods (metals, minerals, gas, food, etc.)
 */
import type { DataForgeContext } from './dataforge-utils.js';
import { MANUFACTURER_CODES, resolveComponentName } from './dataforge-utils.js';
import logger from './logger.js';

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
  // Personal armor + clothing (from scitem/characters/human/)
  { regex: /scitem\/characters\/.*\/armor\/.*helmet/i, type: 'Armor_Helmet' },
  { regex: /scitem\/characters\/.*\/armor\/.*torso|.*core/i, type: 'Armor_Torso' },
  { regex: /scitem\/characters\/.*\/armor\/.*arm/i, type: 'Armor_Arms' },
  { regex: /scitem\/characters\/.*\/armor\/.*leg/i, type: 'Armor_Legs' },
  { regex: /scitem\/characters\/.*\/armor\/.*backpack/i, type: 'Armor_Backpack' },
  { regex: /scitem\/characters\/.*undersuit/i, type: 'Undersuit' },
  { regex: /scitem\/characters\/.*\/clothing\//i, type: 'Clothing' },
  // Tools & gadgets from carryables
  { regex: /scitem\/carryables\/1h\/.*tool|.*multitool/i, type: 'Tool' },
  { regex: /scitem\/carryables\/1h\//i, type: 'Gadget', subType: 'Handheld' },
  { regex: /scitem\/carryables\/2h\//i, type: 'Gadget', subType: 'Two-handed' },
  // Consumables
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
];

/** Check if path is a commodity */
function classifyCommodity(filePath: string): string | null {
  const fp = filePath.replace(/\\/g, '/').toLowerCase();
  for (const pat of COMMODITY_PATHS) {
    if (pat.regex.test(fp)) return pat.type;
  }
  return null;
}

// ── Skip filters ──

function shouldSkipItem(className: string): boolean {
  const lc = className.toLowerCase();
  return (
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
        if (shouldSkipItem(className)) continue;
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
          dataJson: null,
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
      if (shouldSkipItem(className)) continue;
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

      const extData: Record<string, unknown> = {};

      for (const c of comps) {
        if (!c || typeof c !== 'object' || !c.__type) continue;
        const cType = c.__type as string;

        // Attachable info (size, grade, manufacturer, name)
        if (cType === 'SAttachableComponentParams') {
          const ad = c.AttachDef;
          if (ad && typeof ad === 'object') {
            if (typeof ad.Size === 'number') item.size = ad.Size;
            if (typeof ad.Grade === 'number') item.grade = String.fromCharCode(65 + ad.Grade);
            if (ad.SubType && typeof ad.SubType === 'string') {
              item.subType = item.subType || ad.SubType;
            }
            if (ad.Type && typeof ad.Type === 'string') {
              extData.attachType = ad.Type;
              // Refine type from AttachDef.Type
              if (!item.subType) {
                if (ad.Type === 'Char_Armor_Helmet') item.type = 'Armor_Helmet';
                else if (ad.Type === 'Char_Armor_Torso') item.type = 'Armor_Torso';
                else if (ad.Type === 'Char_Armor_Arms') item.type = 'Armor_Arms';
                else if (ad.Type === 'Char_Armor_Legs') item.type = 'Armor_Legs';
                else if (ad.Type === 'Char_Armor_Backpack') item.type = 'Armor_Backpack';
                else if (ad.Type === 'Char_Clothing_Torso') item.type = 'Clothing';
                else if (ad.Type === 'Char_Clothing_Legs') item.type = 'Clothing';
                else if (ad.Type === 'Char_Clothing_Feet') item.type = 'Clothing';
                else if (ad.Type === 'Char_Clothing_Hat') item.type = 'Clothing';
              }
            }
            const loc = ad.Localization;
            if (loc?.Name && typeof loc.Name === 'string') {
              if (!loc.Name.startsWith('LOC_') && !loc.Name.startsWith('@')) {
                item.name = loc.Name;
              }
            }
            if (typeof ad.Manufacturer === 'string' && ad.Manufacturer) {
              extData.manufacturerRef = ad.Manufacturer;
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
            const pa = fireActions[0];
            if (pa && typeof pa === 'object') {
              if (typeof pa.fireRate === 'number') item.weaponFireRate = Math.round(pa.fireRate * 100) / 100;
              if (typeof pa.heatPerShot === 'number') extData.weaponHeatPerShot = Math.round(pa.heatPerShot * 100000) / 100000;
            }
          }
        }

        // Ammo / damage
        if (cType === 'SAmmoContainerComponentParams') {
          if (typeof c.maxAmmoCount === 'number') item.weaponAmmoCount = c.maxAmmoCount;
          if (typeof c.initialAmmoCount === 'number' && !item.weaponAmmoCount) item.weaponAmmoCount = c.initialAmmoCount;

          const ammoGuid = c.ammoParamsRecord?.__ref;
          if (ammoGuid) {
            try {
              const ammoData = ctx.readRecordByGuid(ammoGuid, 5);
              if (ammoData) {
                if (typeof ammoData.speed === 'number') item.weaponSpeed = Math.round(ammoData.speed * 100) / 100;
                if (typeof ammoData.lifetime === 'number' && item.weaponSpeed) {
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

        // Armor stats
        if (cType === 'SCItemSuitArmorParams' || cType === 'SArmorParams') {
          if (typeof c.damageMultiplier === 'number') item.armorDamageReduction = Math.round((1 - c.damageMultiplier) * 10000) / 10000;
          if (typeof c.DamageMultiplier === 'number' && !item.armorDamageReduction)
            item.armorDamageReduction = Math.round((1 - c.DamageMultiplier) * 10000) / 10000;
        }

        // Temperature resistance
        if (cType === 'SCItemClothingParams' || cType === 'SClothingParams') {
          if (typeof c.temperatureResistance === 'object' && c.temperatureResistance) {
            if (typeof c.temperatureResistance.MinResistance === 'number') item.armorTempMin = c.temperatureResistance.MinResistance;
            if (typeof c.temperatureResistance.MaxResistance === 'number') item.armorTempMax = c.temperatureResistance.MaxResistance;
          }
        }

        // Purchasable info
        if (cType === 'SCItemPurchasableParams') {
          if (c.displayName && typeof c.displayName === 'string' && !c.displayName.startsWith('@')) {
            item.name = c.displayName;
          }
        }
      }

      // Compute DPS
      if (item.weaponDamage && item.weaponFireRate) {
        item.weaponDps = Math.round(item.weaponDamage * (item.weaponFireRate / 60) * 10000) / 10000;
      }

      // Manufacturer from className prefix
      if (!item.manufacturerCode) {
        const mfgMatch = className.match(/^([A-Z]{3,5})_/);
        if (mfgMatch && MANUFACTURER_CODES[mfgMatch[1]]) {
          item.manufacturerCode = mfgMatch[1];
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
