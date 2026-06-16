/**
 * STARMAP ASSET SCRAPER → rsi.starmap_locations.assets
 *
 * Scrapes 3D asset URLs (textures, models, skybox) from the RSI ARK Starmap
 * WebGL application via Playwright response interception and persists them to
 * the assets JSONB column of each system-level starmap_locations row.
 */
import type { PoolClient } from 'pg';
import type { GameEnv } from '../module-registry.js';
import { type StarmapSystem, scrapeStarmapSystemAssets } from '../starmap-asset-scraper.js';

export async function saveStarmapAssets(
  conn: PoolClient,
  _env: GameEnv,
  opts: { force?: boolean; concurrency?: number; waitMs?: number },
  onProgress?: (msg: string) => void,
): Promise<void> {
  const { force = false, concurrency = 1, waitMs = 6000 } = opts;
  await conn.query('ALTER TABLE rsi.starmap_locations ADD COLUMN IF NOT EXISTS assets JSONB');

  const { rows } = await conn.query<{ rsi_id: string; name: string; system_code: string }>(
    `SELECT rsi_id, name, system_code
     FROM rsi.starmap_locations
     WHERE type = 'system'
       AND system_code IS NOT NULL
       ${force ? '' : 'AND assets IS NULL'}
     ORDER BY name`,
  );

  if (!rows.length) {
    onProgress?.(
      force ? 'Starmap assets: no systems found' : 'Starmap assets: all systems already have scraped assets — nothing to scrape',
    );
    return;
  }

  onProgress?.(`Starmap assets: scraping ${rows.length} system(s) via Playwright…`);

  const systems: StarmapSystem[] = rows.map((r) => ({
    code: r.system_code,
    name: r.name,
    rsiId: r.rsi_id,
  }));

  const results = await scrapeStarmapSystemAssets(systems, { concurrency, waitMs, onProgress });

  let updated = 0;
  for (const [code, assets] of results) {
    const total = assets.textures.length + assets.models.length + assets.skybox.length;
    if (total === 0) continue;
    await conn.query(`UPDATE rsi.starmap_locations SET assets = $1 WHERE system_code = $2 AND type = 'system'`, [
      JSON.stringify(assets),
      code,
    ]);
    updated++;
  }
  onProgress?.(`Starmap assets: updated ${updated}/${rows.length} system(s)`);
}
