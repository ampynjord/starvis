/**
 * Paint Extractor — Extracts paint/livery records from DataForge
 *
 * Note: Shop extraction has been moved to shop-extractor.ts which reads from
 * Prefab XMLs (Data/Prefabs/shops/**) instead of SCItemManufacturer records.
 */
import type { DataForgeContext } from '../dataforge/dataforge-utils.js';
import logger from '../logger.js';

// ============ Paint / livery extraction ============

/**
 * Extract all ship paint/livery records from DataForge.
 * Paints are EntityClassDefinition records in scitem paths with "paint" in the filename.
 */
export function extractPaints(
  ctx: DataForgeContext,
): Array<{ shipShortName: string; paintClassName: string; paintName: string; paintUuid: string }> {
  const dfData = ctx.getDfData();
  if (!dfData) return [];
  const entityClassIdx = dfData.structDefs.findIndex((s) => s.name === 'EntityClassDefinition');
  if (entityClassIdx === -1) return [];

  const paints: Array<{ shipShortName: string; paintClassName: string; paintName: string; paintUuid: string }> = [];

  for (const r of dfData.records) {
    if (r.structIndex !== entityClassIdx) continue;
    const fn = (r.fileName || '').toLowerCase();
    // Accept any path containing "paint" or "skin" in the filename — this covers both
    // SC 3.x live paths (Data/Objects/Ships/.../ship_xyz_paint_default.xml) and
    // SC 4.x PTU paths (Data/Entities/Items/Spaceships/Paint/Paint_XYZ.xml).
    if (!fn.includes('paint') && !fn.includes('skin')) continue;

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
    } catch {
      /* non-critical */
    }

    if (className.startsWith('Paint_')) {
      const afterPaint = className.substring(6);
      const eventPattern =
        /_(BIS\d{4}|IAE|ILW|Invictus|PirateWeek|Pirate|Holiday|Penumbra|Showdown|Citizencon|Star_Kitten|Stormbringer|Timberline|Ghoulish|Metallic|Black|White|Grey|Red|Blue|Green|Orange|Purple|Tan|Crimson|Gold|Silver|Carbon|Camo|Digital|Paint|Skin|Livery|Pack|FreeWeekend|FW\d+|NovemberAnniversary|FleetWeek|StarKitten|ValentinesDay|LunarNewYear|JumpTown)/i;
      const match = afterPaint.match(eventPattern);
      if (match?.index && match.index > 0) {
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
