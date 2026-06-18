/**
 * STARMAP ASSET SCRAPER -> rsi.starmap_locations.assets
 *
 * Extracts public asset URLs from RSI Starmap API objects and persists them to
 * rsi.starmap_locations.assets. System-level generic ARK assets are used only
 * as a fallback; object-level textures/thumbnails stay attached to each body.
 */
import type { PoolClient } from 'pg';
import type { GameEnv } from '../module-registry.js';
import {
  assetCount,
  extractPublicAssetsFromStarmapObject,
  type StarmapSystem,
  scrapeStarmapSystemAssets,
} from '../scrapers/starmap-asset-scraper.js';

export async function saveStarmapAssets(
  conn: PoolClient,
  _env: GameEnv,
  opts: { force?: boolean; concurrency?: number; waitMs?: number },
  onProgress?: (msg: string) => void,
): Promise<void> {
  const { force = false, concurrency = 1, waitMs = 6000 } = opts;
  await conn.query('ALTER TABLE rsi.starmap_locations ADD COLUMN IF NOT EXISTS assets JSONB');

  const { rows: objectRows } = await conn.query<{ id: number; raw_json: unknown }>(
    `SELECT id, raw_json
     FROM rsi.starmap_locations
     WHERE raw_json IS NOT NULL
       ${force ? '' : 'AND assets IS NULL'}
     ORDER BY name`,
  );

  let objectUpdated = 0;
  for (const row of objectRows) {
    const assets = extractPublicAssetsFromStarmapObject(row.raw_json);
    if (assetCount(assets) === 0) continue;
    await conn.query('UPDATE rsi.starmap_locations SET assets = $1 WHERE id = $2', [JSON.stringify(assets), row.id]);
    objectUpdated++;
  }

  onProgress?.(`Starmap assets: updated ${objectUpdated}/${objectRows.length} object(s) from public RSI metadata`);

  const { rows: systemRows } = await conn.query<{ rsi_id: string; name: string; system_code: string }>(
    `SELECT rsi_id, name, system_code
     FROM rsi.starmap_locations
     WHERE type = 'system'
       AND system_code IS NOT NULL
       ${force ? '' : 'AND assets IS NULL'}
     ORDER BY name`,
  );

  if (!systemRows.length) {
    onProgress?.(force ? 'Starmap assets: no systems found for generic ARK fallback' : 'Starmap assets: all systems already have assets');
    return;
  }

  onProgress?.(`Starmap assets: filling generic ARK fallback for ${systemRows.length} system(s)`);

  const systems: StarmapSystem[] = systemRows.map((r) => ({
    code: r.system_code,
    name: r.name,
    rsiId: r.rsi_id,
  }));

  const results = await scrapeStarmapSystemAssets(systems, { concurrency, waitMs, onProgress });

  let systemUpdated = 0;
  for (const [code, assets] of results) {
    if (assetCount(assets) === 0) continue;
    await conn.query('UPDATE rsi.starmap_locations SET assets = $1 WHERE system_code = $2 AND type = $3', [
      JSON.stringify(assets),
      code,
      'system',
    ]);
    systemUpdated++;
  }
  onProgress?.(`Starmap assets: updated ${systemUpdated}/${systemRows.length} system(s) with generic ARK fallback`);
}
