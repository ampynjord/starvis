/**
 * Shop & Paint Extractor — Extracts shop kiosks and paint/livery records from DataForge
 *
 * Extracted from DataForgeService to reduce god-class size.
 * Depends on DataForgeContext interface (no circular dependency).
 */
import type { DataForgeContext } from "./dataforge-utils.js";
import { SHOP_LOC_NAMES } from "./dataforge-utils.js";
import logger from "./logger.js";

// ============ Shop extraction ============

function inferShopType(className: string): string {
  const lc = className.toLowerCase();
  if (lc.includes('weapon') || lc.includes('gun')) return 'Weapons';
  if (lc.includes('armor') || lc.includes('clothing')) return 'Armor';
  if (lc.includes('ship') || lc.includes('vehicle')) return 'Ships';
  if (lc.includes('component') || lc.includes('part')) return 'Components';
  if (lc.includes('commodity') || lc.includes('cargo') || lc.includes('trade')) return 'Commodities';
  if (lc.includes('food') || lc.includes('drink') || lc.includes('bar')) return 'Food & Drink';
  return 'General';
}

/**
 * Extract shop/vendor data from DataForge.
 * Real shops are SCItemManufacturer records in shopkiosk/ paths.
 * Note: Per-shop inventory (what each shop sells) is server-managed
 * and NOT available from P4K/DataForge data. shop_inventory will remain empty.
 */
export function extractShops(ctx: DataForgeContext): { shops: any[]; inventory: any[] } {
  const dfData = ctx.getDfData();
  if (!dfData) return { shops: [], inventory: [] };

  const shops: any[] = [];
  const inventory: any[] = [];

  const mfgStructIdx = dfData.structDefs.findIndex(s => s.name === 'SCItemManufacturer');
  if (mfgStructIdx === -1) {
    logger.info('SCItemManufacturer struct not found — skipping shop extraction', { module: 'dataforge' });
    return { shops: [], inventory: [] };
  }

  for (const r of dfData.records) {
    if (r.structIndex !== mfgStructIdx) continue;
    const fn = (r.fileName || '').toLowerCase();
    if (!fn.includes('shop/shopkiosk/') && !fn.includes('shop\\shopkiosk\\')) continue;

    try {
      const data = ctx.readInstance(r.structIndex, r.instanceIndex, 0, 3);
      if (!data) continue;

      const className = r.name?.replace('SCItemManufacturer.', '') || '';
      if (!className) continue;
      if (className.toLowerCase().includes('_test') || className.toLowerCase().includes('_debug')) continue;

      const locKey = data.Localization?.Name || '';
      const shopName = SHOP_LOC_NAMES[locKey]
        || (locKey.startsWith('@') ? className.replace(/_/g, ' ').replace('Shop ', '') : locKey)
        || className.replace(/_/g, ' ');

      const shopCode = data.Code || '';
      const shopType = inferShopType(className);

      shops.push({
        className,
        name: shopName,
        location: null,
        parentLocation: null,
        shopType,
        shopCode,
      });
    } catch (e) {
      // Skip problematic records
    }
  }

  // Deduplicate shops by name + shopType
  const shopMap = new Map<string, any>();
  for (const s of shops) {
    const key = `${s.name}::${s.shopType}`;
    if (!shopMap.has(key)) shopMap.set(key, s);
  }
  const uniqueShops = Array.from(shopMap.values());
  logger.info(`Extracted ${uniqueShops.length} unique shops from ${shops.length} kiosk instances`, { module: 'dataforge' });
  return { shops: uniqueShops, inventory };
}

// ============ Paint / livery extraction ============

/**
 * Extract all ship paint/livery records from DataForge.
 * Paints are EntityClassDefinition records in scitem paths with "paint" in the filename.
 */
export function extractPaints(ctx: DataForgeContext): Array<{ shipShortName: string; paintClassName: string; paintName: string; paintUuid: string }> {
  const dfData = ctx.getDfData();
  if (!dfData) return [];
  const entityClassIdx = dfData.structDefs.findIndex(s => s.name === 'EntityClassDefinition');
  if (entityClassIdx === -1) return [];

  const paints: Array<{ shipShortName: string; paintClassName: string; paintName: string; paintUuid: string }> = [];

  for (const r of dfData.records) {
    if (r.structIndex !== entityClassIdx) continue;
    const fn = (r.fileName || '').toLowerCase();
    if (!fn.includes('paint') && !fn.includes('skin')) continue;
    if (!fn.includes('scitem') && !fn.includes('entities')) continue;

    const className = r.name?.replace('EntityClassDefinition.', '') || '';
    if (!className) continue;
    const lcName = className.toLowerCase();
    if (lcName.includes('_test') || lcName.includes('_debug') || lcName.includes('_template')) continue;

    let paintDisplayName = className.replace(/_/g, ' ');
    let shipShortName = '';

    try {
      const data = ctx.readInstance(r.structIndex, r.instanceIndex, 0, 3);
      if (data?.Components) {
        for (const comp of data.Components) {
          if (!comp || typeof comp !== 'object') continue;
          if (comp.__type === 'SAttachableComponentParams') {
            const loc = comp.AttachDef?.Localization;
            if (loc?.Name && typeof loc.Name === 'string' && !loc.Name.startsWith('@') && !loc.Name.startsWith('LOC_')) {
              paintDisplayName = loc.Name;
            }
          }
        }
      }
    } catch { /* non-critical */ }

    if (className.startsWith('Paint_')) {
      const afterPaint = className.substring(6);
      const eventPattern = /_(BIS\d{4}|IAE|ILW|Invictus|PirateWeek|Pirate|Holiday|Penumbra|Showdown|Citizencon|Star_Kitten|Stormbringer|Timberline|Ghoulish|Metallic|Black|White|Grey|Red|Blue|Green|Orange|Purple|Tan|Crimson|Gold|Silver|Carbon|Camo|Digital|Paint|Skin|Livery|Pack|FreeWeekend|FW\d+|NovemberAnniversary|FleetWeek|StarKitten|ValentinesDay|LunarNewYear|JumpTown)/i;
      const match = afterPaint.match(eventPattern);
      if (match && match.index && match.index > 0) {
        shipShortName = afterPaint.substring(0, match.index);
      } else {
        shipShortName = afterPaint;
      }
    } else {
      const skinMatch = className.match(/^([A-Z]{2,5}_[A-Za-z0-9_]+?)_(Paint|Skin|Livery)/i);
      if (skinMatch) shipShortName = skinMatch[1];
    }

    if (shipShortName) {
      paints.push({
        shipShortName,
        paintClassName: className,
        paintName: paintDisplayName,
        paintUuid: r.id,
      });
    }
  }

  logger.info(`Extracted ${paints.length} paint/livery records`, { module: 'dataforge' });
  return paints;
}
