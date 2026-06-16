/**
 * CTM SCRAPER → ships.ctm_url
 */
import type { PoolClient } from 'pg';
import { type ShipToScrape, scrapeShipCtmUrls } from '../ctm-scraper.js';
import type { GameEnv } from '../module-registry.js';

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

  // Incremental mode: query ALL envs so PTU-only ships also get a CTM URL.
  // The UPDATE below is already env-agnostic (WHERE class_name = ?) so a single
  // scrape covers every env at once.
  const { rows: gameRows } = await conn.query<any>(
    `SELECT DISTINCT ON (s.class_name) s.class_name, s.name, sm.url as rsi_url
     FROM game.ships s
     INNER JOIN rsi.ship_matrix sm ON s.ship_matrix_id = sm.id
     WHERE s.vehicle_category = 'ship'
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
    updatedGame++;
  }
  onProgress?.(`CTM: ${updatedGame} game ships updated (all envs), ${updatedConcept} concept ships updated`);
}
