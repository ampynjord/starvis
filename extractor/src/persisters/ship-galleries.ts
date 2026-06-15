/**
 * Official RSI ship galleries -> rsi.ship_galleries.
 */
import type { PoolClient } from 'pg';
import { type ShipGalleryToScrape, scrapeShipGalleryImages } from '../ship-gallery-scraper.js';

export async function saveOfficialShipGalleries(
  conn: PoolClient,
  opts: {
    force?: boolean;
    concurrency?: number;
    interShipDelayMs?: number;
    retries?: number;
    retryBaseDelayMs?: number;
  },
  onProgress?: (msg: string) => void,
): Promise<number> {
  const { force = false, concurrency = 1 } = opts;
  await ensureShipGalleryTable(conn);

  const { rows } = await conn.query<{
    ship_matrix_id: number;
    class_name: string;
    name: string;
    rsi_url: string;
    fallback_url: string | null;
    gallery_count: string | number;
  }>(
    `SELECT DISTINCT ON (sm.id)
        sm.id as ship_matrix_id,
        COALESCE(s.class_name, 'concept-' || sm.id::text) as class_name,
        COALESCE(s.name, sm.name) as name,
        sm.url as rsi_url,
        COALESCE(sm.media_source_url, sm.media_store_large, sm.media_store_small) as fallback_url,
        COALESCE(g.gallery_count, 0) as gallery_count
      FROM rsi.ship_matrix sm
      LEFT JOIN game.ships s ON s.ship_matrix_id = sm.id
      LEFT JOIN (
        SELECT ship_matrix_id, COUNT(*) as gallery_count
        FROM rsi.ship_galleries
        GROUP BY ship_matrix_id
      ) g ON g.ship_matrix_id = sm.id
      WHERE sm.url IS NOT NULL
        ${force ? '' : 'AND COALESCE(g.gallery_count, 0) = 0'}
      ORDER BY sm.id, s.env NULLS LAST`,
  );

  if (!rows.length) {
    onProgress?.(force ? 'Ship galleries: no RSI ship pages found' : 'Ship galleries: all known ships already have gallery rows');
    return 0;
  }

  const ships: ShipGalleryToScrape[] = rows.map((row) => ({
    shipMatrixId: Number(row.ship_matrix_id),
    className: row.class_name,
    name: row.name,
    rsiUrl: row.rsi_url,
    fallbackImageUrl: row.fallback_url,
  }));
  onProgress?.(`Ship galleries: scraping ${ships.length} RSI pledge page${ships.length !== 1 ? 's' : ''}`);

  const galleries = await scrapeShipGalleryImages(ships, {
    concurrency,
    interShipDelayMs: opts.interShipDelayMs,
    retries: opts.retries,
    retryBaseDelayMs: opts.retryBaseDelayMs,
    onProgress,
  });
  let saved = 0;
  for (const [shipMatrixId, images] of galleries) {
    await conn.query('DELETE FROM rsi.ship_galleries WHERE ship_matrix_id = $1', [shipMatrixId]);
    for (const image of images) {
      await conn.query(
        `INSERT INTO rsi.ship_galleries
          (ship_matrix_id, url, thumbnail_url, title, kind, position, raw_json, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (ship_matrix_id, url) DO UPDATE SET
           thumbnail_url = EXCLUDED.thumbnail_url,
           title = EXCLUDED.title,
           kind = EXCLUDED.kind,
           position = EXCLUDED.position,
           raw_json = EXCLUDED.raw_json,
           synced_at = NOW()`,
        [
          shipMatrixId,
          image.url,
          image.thumbnailUrl,
          image.title,
          image.kind,
          image.position,
          image.raw ? JSON.stringify(image.raw) : null,
        ],
      );
      saved++;
    }
  }

  onProgress?.(`Ship galleries: saved ${saved} official image${saved !== 1 ? 's' : ''}`);
  return saved;
}

async function ensureShipGalleryTable(conn: PoolClient): Promise<void> {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS rsi.ship_galleries (
      id SERIAL NOT NULL,
      ship_matrix_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      thumbnail_url TEXT,
      title VARCHAR(255),
      kind VARCHAR(50) NOT NULL DEFAULT 'official-gallery',
      position INTEGER NOT NULL DEFAULT 0,
      raw_json JSONB,
      synced_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT ship_galleries_pkey PRIMARY KEY (id),
      CONSTRAINT ship_galleries_ship_matrix_id_fkey
        FOREIGN KEY (ship_matrix_id) REFERENCES rsi.ship_matrix(id) ON DELETE CASCADE ON UPDATE CASCADE,
      UNIQUE (ship_matrix_id, url)
    )
  `);
  await conn.query('CREATE INDEX IF NOT EXISTS ship_galleries_ship_matrix_id_idx ON rsi.ship_galleries(ship_matrix_id)');
}
