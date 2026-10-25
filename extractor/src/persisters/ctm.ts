/**
 * CTM SCRAPER → ships.ctm_url
 */
import type { PoolClient } from 'pg';
import type { GameEnv } from '../module-registry.js';
import { type ShipToScrape, scrapeShipCtmUrls } from '../scrapers/ctm-scraper.js';

/**
 * Scrape 3D model (.ctm) URLs from the RSI website and persist them to ships.ctm_url.
 *
 * Only processes ships that have a ship_matrix URL (RSI page known).
 * Skip nothing in the DB: previously scraped URLs are kept unless overwritten.
 */
export async function saveShipCtmModels(
  conn: PoolClient,
  _env: GameEnv,
  ctmOpts: { force?: boolean; concurrency?: number },
  onProgress?: (msg: string) => void,
): Promise<void> {
  const { force = false, concurrency = 1 } = ctmOpts;
  await conn.query('ALTER TABLE rsi.ship_matrix ADD COLUMN IF NOT EXISTS ctm_url VARCHAR(500)');

  // Cross-propagate existing CTM URLs between game.ships and rsi.ship_matrix via ship_matrix_id
  await conn.query(
    `UPDATE rsi.ship_matrix sm
     SET ctm_url = s.ctm_url
     FROM game.ships s
     WHERE s.ship_matrix_id = sm.id
       AND sm.ctm_url IS NULL
       AND s.ctm_url IS NOT NULL`,
  );
  await conn.query(
    `UPDATE game.ships s
     SET ctm_url = sm.ctm_url
     FROM rsi.ship_matrix sm
     WHERE s.ship_matrix_id = sm.id
       AND s.ctm_url IS NULL
       AND sm.ctm_url IS NOT NULL`,
  );

  // Incremental mode: query ALL envs and ALL vehicle categories (ship, ground, gravlev)
  // so ground vehicles, gravlev bikes, and PTU-only ships also get a CTM URL.
  const { rows: gameRows } = await conn.query<any>(
    `SELECT DISTINCT ON (s.class_name) s.class_name, s.name, sm.url as rsi_url
     FROM game.ships s
     INNER JOIN rsi.ship_matrix sm ON s.ship_matrix_id = sm.id
     WHERE s.vehicle_category IN ('ship', 'ground', 'gravlev')
       AND sm.url IS NOT NULL
       ${force ? '' : 'AND s.ctm_url IS NULL'}
     ORDER BY s.class_name, s.env`,
  );

  const { rows: conceptRows } = await conn.query<any>(
    `SELECT 'concept-' || sm.id::text as class_name, sm.name, sm.url as rsi_url
     FROM rsi.ship_matrix sm
     WHERE sm.url IS NOT NULL
       AND sm.production_status IN ('in-concept', 'in-production', 'in-development')
       AND sm.id NOT IN (SELECT ship_matrix_id FROM game.ships WHERE ship_matrix_id IS NOT NULL)
       ${force ? '' : 'AND sm.ctm_url IS NULL'}
     ORDER BY sm.name`,
  );

  if (!gameRows.length && !conceptRows.length) {
    onProgress?.(force ? 'CTM: no ships with RSI URL found, skipping' : 'CTM: all ships already have a CTM URL — nothing to scrape');
    return;
  }

  const ships: ShipToScrape[] = gameRows.map((r: any) => ({
    className: r.class_name as string,
    name: r.name as string,
    rsiUrl: r.rsi_url as string,
  }));
  const conceptShips: ShipToScrape[] = conceptRows.map((r: any) => ({
    className: r.class_name as string,
    name: r.name as string,
    rsiUrl: r.rsi_url as string,
  }));
  const allShips = [...ships, ...conceptShips];

  onProgress?.(`CTM: scraping ${ships.length} ship${ships.length !== 1 ? 's' : ''}…`);
  const ctmMap = await scrapeShipCtmUrls(allShips, { concurrency, onProgress });
  onProgress?.(`CTM: found ${ctmMap.size}/${allShips.length} CTM URLs`);

  if (!ctmMap.size) return;

  let updatedGame = 0;
  let updatedConcept = 0;
  for (const [className, ctmUrl] of ctmMap) {
    if (className.startsWith('concept-')) {
      const shipMatrixId = Number(className.replace('concept-', ''));
      if (Number.isInteger(shipMatrixId)) {
        await conn.query('UPDATE rsi.ship_matrix SET ctm_url = $1 WHERE id = $2', [ctmUrl, shipMatrixId]);
        updatedConcept++;
      }
      continue;
    }
    // Update across all envs — CTM URLs come from RSI website (env-agnostic)
    await conn.query('UPDATE game.ships SET ctm_url = $1 WHERE class_name = $2', [ctmUrl, className]);
    await conn.query(
      `UPDATE rsi.ship_matrix sm
       SET ctm_url = $1
       FROM game.ships s
       WHERE s.class_name = $2 AND s.ship_matrix_id = sm.id AND sm.ctm_url IS NULL`,
      [ctmUrl, className],
    );
    updatedGame++;
  }

  // Propagate CTM URLs across variants sharing the same RSI chassis_id when a variant lacks its own CTM
  await conn.query(
    `UPDATE game.ships s1
     SET ctm_url = sub.ctm_url
     FROM (
       SELECT sm1.id AS ship_matrix_id,
              (SELECT s2.ctm_url
               FROM game.ships s2
               JOIN rsi.ship_matrix sm2 ON sm2.id = s2.ship_matrix_id
               WHERE sm2.chassis_id = sm1.chassis_id AND s2.ctm_url IS NOT NULL
               LIMIT 1) AS ctm_url
       FROM rsi.ship_matrix sm1
       WHERE sm1.chassis_id IS NOT NULL
     ) sub
     WHERE s1.ship_matrix_id = sub.ship_matrix_id
       AND s1.ctm_url IS NULL
       AND sub.ctm_url IS NOT NULL`,
  );
  await conn.query(
    `UPDATE rsi.ship_matrix sm
     SET ctm_url = s.ctm_url
     FROM game.ships s
     WHERE s.ship_matrix_id = sm.id
       AND sm.ctm_url IS NULL
       AND s.ctm_url IS NOT NULL`,
  );

  onProgress?.(`CTM: ${updatedGame} game ships updated (all envs), ${updatedConcept} concept ships updated`);
}
