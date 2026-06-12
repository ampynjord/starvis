/**
 * MINING DATA → mining_elements + mining_compositions + mining_composition_parts tables
 */
import { extractMiningCompositions, extractMiningElements } from '../mining-extractor.js';
import { batchUpsert } from './batch.js';
import type { PersistContext } from './context.js';

export async function saveMiningData(ctx: PersistContext): Promise<{ elements: number; compositions: number }> {
  const { conn, env, df, loc, onProgress } = ctx;
  const locAdapter = loc.isLoaded ? { resolve: (k: string) => loc.resolveKey(k) ?? null } : undefined;

  const allElements = extractMiningElements(df, locAdapter);
  // Filter out test/template entries
  const elements = allElements.filter((e) => !e.className.toLowerCase().includes('test') && !e.name?.toLowerCase().includes('template'));

  const allCompositions = extractMiningCompositions(df, elements, locAdapter);
  // Filter out test/template compositions
  const compositions = allCompositions.filter(
    (c) => !c.className.toLowerCase().includes('test') && !c.depositName?.toLowerCase().includes('test'),
  );

  if (!elements.length && !compositions.length) {
    onProgress?.('Mining: no data found in DataForge');
    return { elements: 0, compositions: 0 };
  }

  // ── Save elements ──
  const elemRows = elements.map((e) => [
    env,
    e.uuid,
    e.className,
    e.name,
    e.commodityUuid,
    e.instability,
    e.resistance,
    e.optimalWindowMidpoint,
    e.optimalWindowMidpointRand,
    e.optimalWindowThinness,
    e.explosionMultiplier,
    e.clusterFactor,
    e.p4kPath,
    e.rawJson ? JSON.stringify(e.rawJson) : null,
  ]);
  const savedElements = await batchUpsert(
    conn,
    `INSERT INTO game.mining_elements
       (env, uuid, class_name, name, commodity_uuid,
        instability, resistance,
        optimal_window_midpoint, optimal_window_midpoint_rand,
        optimal_window_thinness, explosion_multiplier, cluster_factor,
        p4k_path, raw_json)`,
    `(uuid, env) DO UPDATE SET
       class_name=EXCLUDED.class_name, name=EXCLUDED.name, commodity_uuid=EXCLUDED.commodity_uuid,
       instability=EXCLUDED.instability, resistance=EXCLUDED.resistance,
       optimal_window_midpoint=EXCLUDED.optimal_window_midpoint,
       optimal_window_midpoint_rand=EXCLUDED.optimal_window_midpoint_rand,
       optimal_window_thinness=EXCLUDED.optimal_window_thinness,
       explosion_multiplier=EXCLUDED.explosion_multiplier, cluster_factor=EXCLUDED.cluster_factor,
       p4k_path=EXCLUDED.p4k_path, raw_json=EXCLUDED.raw_json`,
    14,
    elemRows,
  );

  // ── Save compositions (parent rows first) ──
  const compRows = compositions.map((c) => [
    env,
    c.uuid,
    c.className,
    c.depositName,
    c.minDistinctElements,
    c.p4kPath,
    c.rawJson ? JSON.stringify(c.rawJson) : null,
  ]);
  await batchUpsert(
    conn,
    `INSERT INTO game.mining_compositions (env, uuid, class_name, deposit_name, min_distinct_elements, p4k_path, raw_json)`,
    `(uuid, env) DO UPDATE SET class_name=EXCLUDED.class_name, deposit_name=EXCLUDED.deposit_name, min_distinct_elements=EXCLUDED.min_distinct_elements, p4k_path=EXCLUDED.p4k_path, raw_json=EXCLUDED.raw_json`,
    7,
    compRows,
  );

  // ── Save composition parts ──
  const elementUuidSet = new Set(elements.map((e) => e.uuid));
  const partRows: (string | number | null)[][] = [];
  for (const comp of compositions) {
    for (const part of comp.parts) {
      if (elementUuidSet.has(part.elementUuid)) {
        partRows.push([
          env,
          env,
          comp.uuid,
          part.elementUuid,
          part.minPercentage,
          part.maxPercentage,
          part.probability,
          part.curveExponent,
        ]);
      }
    }
  }
  if (partRows.length > 0) {
    await batchUpsert(
      conn,
      `INSERT INTO game.mining_composition_parts
         (composition_env, element_env, composition_uuid, element_uuid, min_percentage, max_percentage, probability, curve_exponent)`,
      '',
      8,
      partRows,
    );
  }

  onProgress?.(`Mining: ${savedElements} elements, ${compositions.length} compositions, ${partRows.length} parts`);
  return { elements: savedElements, compositions: compositions.length };
}
