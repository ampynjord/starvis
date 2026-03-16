/**
 * Mining Extractor — Extracts MineableElement and MineableComposition records
 * from DataForge (P4K/Game2.dcb).
 *
 * Outputs:
 *   - mining_elements        (~43 entries)  — minerals with instability, resistance, window params
 *   - mining_compositions    (~185 entries) — rock types (asteroid, surface, etc.)
 *   - mining_composition_parts              — mineral percentages per rock type
 */
import type { DataForgeContext } from './dataforge-utils.js';
import logger from './logger.js';

export interface MiningElement {
  uuid: string;
  className: string;
  name: string | null;
  commodityUuid: string | null;
  instability: number | null;
  resistance: number | null;
  optimalWindowMidpoint: number | null;
  optimalWindowMidpointRand: number | null;
  optimalWindowThinness: number | null;
  explosionMultiplier: number | null;
  clusterFactor: number | null;
}

export interface MiningCompositionPart {
  elementUuid: string;
  minPercentage: number | null;
  maxPercentage: number | null;
  probability: number | null;
  curveExponent: number | null;
}

export interface MiningComposition {
  uuid: string;
  className: string;
  depositName: string | null;
  minDistinctElements: number | null;
  parts: MiningCompositionPart[];
}

// ── Helpers ──────────────────────────────────────────────────

function n(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const f = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(f) ? f : null;
}

function _locKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Remove @-prefix locale keys → keep raw localization key
  return raw.startsWith('@') ? raw : null;
}

// ── MineableElement extraction ────────────────────────────────

export function extractMiningElements(ctx: DataForgeContext, _locService?: { resolve(key: string): string | null }): MiningElement[] {
  const dfData = ctx.getDfData();
  if (!dfData) return [];

  const structIdx = dfData.structDefs.findIndex((s) => s.name === 'MineableElement');
  if (structIdx === -1) {
    logger.warn('MineableElement struct not found in DataForge');
    return [];
  }

  const records = dfData.records.filter((r) => r.structIndex === structIdx);
  const results: MiningElement[] = [];

  for (const r of records) {
    try {
      const data = ctx.readInstance(r.structIndex, r.instanceIndex, 0, 4);
      if (!data) continue;

      // Resolve commodity UUID from resourceType ref
      let commodityUuid: string | null = null;
      if (data.resourceType?.__ref && data.resourceType.__ref !== '00000000-0000-0000-0000-000000000000') {
        const refData = ctx.readRecordByGuid(data.resourceType.__ref, 2);
        commodityUuid = data.resourceType.__ref;
        // Try to resolve the actual commodity name
        void refData;
      }

      // Derive element name from class_name:
      //   "MinableElement_FPS_Jaclium"             → "Jaclium"
      //   "MinableElement_GroundVehicle_Carinite"  → "Carinite"
      //   "MineableElement_Copper_Ore"             → "Copper Ore"
      const rawName = r.name
        .replace(/^(?:Mine?ableElement[._\s]+)+/gi, '') // strip repeated struct prefix
        .replace(/^(?:FPS|GroundVehicle|SpaceShip|Vehicle|Hangar|Ship)[._\s]+/gi, '')
        .replace(/_/g, ' ')
        .trim();

      results.push({
        uuid: r.id,
        className: r.name,
        name: rawName,
        commodityUuid,
        instability: n(data.elementInstability),
        resistance: n(data.elementResistance),
        optimalWindowMidpoint: n(data.elementOptimalWindowMidpoint),
        optimalWindowMidpointRand: n(data.elementOptimalWindowMidpointRandomness),
        optimalWindowThinness: n(data.elementOptimalWindowThinness),
        explosionMultiplier: n(data.elementExplosionMultiplier),
        clusterFactor: n(data.elementClusterFactor),
      });
    } catch (e) {
      logger.debug(`MineableElement parse error [${r.name}]: ${(e as Error).message}`);
    }
  }

  logger.info(`Extracted ${results.length} mining elements from ${records.length} records`);
  return results;
}

// ── MineableComposition extraction ───────────────────────────

export function extractMiningCompositions(
  ctx: DataForgeContext,
  elements: MiningElement[],
  locService?: { resolve(key: string): string | null },
): MiningComposition[] {
  const dfData = ctx.getDfData();
  if (!dfData) return [];

  const structIdx = dfData.structDefs.findIndex((s) => s.name === 'MineableComposition');
  if (structIdx === -1) {
    logger.warn('MineableComposition struct not found in DataForge');
    return [];
  }

  // Build element UUID index for fast lookup
  const elementByUuid = new Map(elements.map((e) => [e.uuid, e]));
  const _elementByClassName = new Map(elements.map((e) => [e.className.toLowerCase(), e]));

  const records = dfData.records.filter((r) => r.structIndex === structIdx);
  const results: MiningComposition[] = [];

  for (const r of records) {
    try {
      const data = ctx.readInstance(r.structIndex, r.instanceIndex, 0, 5);
      if (!data) continue;

      // Resolve deposit name from locale key
      let depositName: string | null = null;
      if (data.depositName) {
        if (locService && data.depositName.startsWith('@')) {
          depositName = locService.resolve(data.depositName) ?? data.depositName;
        } else {
          depositName = data.depositName;
        }
      }

      // Parse composition parts
      const parts: MiningCompositionPart[] = [];
      const compositionArray = Array.isArray(data.compositionArray) ? data.compositionArray : [];

      for (const part of compositionArray) {
        if (!part?.__type?.includes('MineableCompositionPart')) continue;

        const elementRef = part.mineableElement?.__ref;
        if (!elementRef || elementRef === '00000000-0000-0000-0000-000000000000') continue;

        // Check element exists
        if (!elementByUuid.has(elementRef)) continue;

        parts.push({
          elementUuid: elementRef,
          minPercentage: n(part.minPercentage),
          maxPercentage: n(part.maxPercentage),
          probability: n(part.probability),
          curveExponent: n(part.curveExponent),
        });
      }

      // Derive a human-readable class name: "MineableComposition.Asteroid_PType" → "Asteroid PType"
      const className = r.name;

      results.push({
        uuid: r.id,
        className,
        depositName,
        minDistinctElements: typeof data.minimumDistinctElements === 'number' ? data.minimumDistinctElements : null,
        parts,
      });
    } catch (e) {
      logger.debug(`MineableComposition parse error [${r.name}]: ${(e as Error).message}`);
    }
  }

  logger.info(`Extracted ${results.length} mining compositions from ${records.length} records`);
  return results;
}
