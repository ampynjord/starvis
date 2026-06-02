/**
 * RsiSyncService — Synchronise les données RSI/SC Wiki vers rsi.*.
 *
 * Modules:
 *   galactapedia   → rsi.galactapedia
 *   comm-links     → rsi.comm_links
 *   starmap        → rsi.starmap_locations
 *
 * Source: https://api.star-citizen.wiki/api/
 */
import type { Pool } from 'pg';
import { RSI_BASE_URL, RSI_SHIP_MATRIX_URL, SC_WIKI_API_URL, SCRAPER_USER_AGENT } from './config.js';
import logger from './logger.js';

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': SCRAPER_USER_AGENT },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

export interface SyncStats {
  inserted: number;
  updated: number;
  errors: number;
}

export class RsiSyncService {
  constructor(private pool: Pool) {}

  // ── Galactapedia ─────────────────────────────────────────────────────────────

  async syncGalactapedia(onProgress?: (msg: string) => void): Promise<SyncStats> {
    const stats: SyncStats = { inserted: 0, updated: 0, errors: 0 };
    const conn = await this.pool.connect();
    try {
      let page = 1;
      while (true) {
        const url = `${SC_WIKI_API_URL}/galactapedia?page[number]=${page}&limit=100&with=translations`;
        onProgress?.(`  [galactapedia] page ${page}…`);

        let data: any;
        try {
          data = await fetchJson(url);
        } catch (err) {
          logger.warn(`[galactapedia] fetch error page ${page}: ${(err as Error).message}`);
          stats.errors++;
          break;
        }

        const items: any[] = data.data ?? [];
        if (items.length === 0) break;
        if (page === 1) onProgress?.(`  [galactapedia] total: ${data.meta?.total ?? '?'} (${data.meta?.last_page ?? '?'} pages)`);

        for (const item of items) {
          const id = item.id ?? item.rsi_id ?? null;
          const slug = item.slug ?? null;
          if (!id || !slug) continue;

          const content = item.translations?.en_EN ?? item.content ?? item.body ?? null;
          const excerpt = content ? (content as string).slice(0, 400).replace(/\n/g, ' ') : null;
          const categories = item.categories ? JSON.stringify(item.categories.map((c: any) => c.name ?? c)) : null;
          const tags = item.tags ? JSON.stringify(item.tags.map((t: any) => t.name ?? t)) : null;
          const thumbnailUrl = item.thumbnail?.url ?? item.thumbnail ?? null;
          const rsiUrl = `${RSI_BASE_URL}/galactapedia/article/${id}-${slug}`;

          try {
            const result = await conn.query<any>(
              `INSERT INTO rsi.galactapedia (id, slug, title, content, excerpt, categories, tags, thumbnail_url, rsi_url)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               ON CONFLICT (id) DO UPDATE SET
                 slug=EXCLUDED.slug, title=EXCLUDED.title, content=EXCLUDED.content,
                 excerpt=EXCLUDED.excerpt, categories=EXCLUDED.categories, tags=EXCLUDED.tags,
                 thumbnail_url=EXCLUDED.thumbnail_url, rsi_url=EXCLUDED.rsi_url,
                 updated_at=NOW()`,
              [String(id), String(slug), String(item.title ?? item.name ?? slug), content, excerpt, categories, tags, thumbnailUrl, rsiUrl],
            );
            if (result.rowCount === 1) stats.inserted++;
            else stats.updated++;
          } catch (err) {
            logger.warn(`[galactapedia] upsert error ${id}: ${(err as Error).message}`);
            stats.errors++;
          }
        }

        if (!data.meta?.last_page || page >= data.meta.last_page) break;
        page++;
      }
    } finally {
      conn.release();
    }
    return stats;
  }

  // ── Comm-links ───────────────────────────────────────────────────────────────

  async syncCommLinks(onProgress?: (msg: string) => void): Promise<SyncStats> {
    const stats: SyncStats = { inserted: 0, updated: 0, errors: 0 };
    const conn = await this.pool.connect();
    try {
      let page = 1;
      while (true) {
        const url = `${SC_WIKI_API_URL}/comm-links?page[number]=${page}&limit=100`;
        onProgress?.(`  [comm-links] page ${page}…`);

        let data: any;
        try {
          data = await fetchJson(url);
        } catch (err) {
          logger.warn(`[comm-links] fetch error page ${page}: ${(err as Error).message}`);
          stats.errors++;
          break;
        }

        const items: any[] = data.data ?? [];
        if (items.length === 0) break;
        if (page === 1) onProgress?.(`  [comm-links] total: ~${data.meta?.total ?? '?'}`);

        for (const item of items) {
          const rsiId = String(item.id ?? item.rsi_id ?? '');
          if (!rsiId) continue;

          const rsiUrlPath: string = item.rsi_url ?? '';
          const slug = rsiUrlPath.split('/').pop() ?? null;
          const content = item.translations?.en_EN ?? item.content ?? null;
          const category =
            item.channel && item.channel !== 'Undefined'
              ? item.channel
              : item.category && item.category !== 'Undefined'
                ? item.category
                : null;
          const excerpt = content ? (content as string).slice(0, 400).replace(/\n/g, ' ') : null;
          const publishedAt = item.published_at ?? item.created_at ?? item.time ?? null;
          const publishedAtSql = publishedAt ? new Date(publishedAt).toISOString().slice(0, 19).replace('T', ' ') : null;

          try {
            const result = await conn.query<any>(
              `INSERT INTO rsi.comm_links (rsi_id, slug, title, content, excerpt, category, thumbnail_url, rsi_url, published_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               ON CONFLICT (rsi_id) DO UPDATE SET
                 slug=EXCLUDED.slug, title=EXCLUDED.title, content=EXCLUDED.content,
                 excerpt=EXCLUDED.excerpt, category=EXCLUDED.category,
                 thumbnail_url=EXCLUDED.thumbnail_url, rsi_url=EXCLUDED.rsi_url,
                 published_at=EXCLUDED.published_at`,
              [
                rsiId,
                slug,
                String(item.title ?? item.name ?? rsiId),
                content,
                excerpt,
                category,
                item.thumbnail?.url ?? item.image ?? null,
                item.rsi_url ?? `${RSI_BASE_URL}/comm-link/${rsiId}`,
                publishedAtSql,
              ],
            );
            if (result.rowCount === 1) stats.inserted++;
            else stats.updated++;
          } catch (err) {
            logger.warn(`[comm-links] upsert error ${rsiId}: ${(err as Error).message}`);
            stats.errors++;
          }
        }

        if (!data.meta?.last_page || page >= data.meta.last_page) break;
        page++;
      }
    } finally {
      conn.release();
    }
    return stats;
  }

  // ── Ship Matrix ─────────────────────────────────────────────────────────────

  async syncShipMatrix(onProgress?: (msg: string) => void): Promise<{ synced: number; errors: number }> {
    const stats = { synced: 0, errors: 0 };

    let data: any;
    try {
      data = await fetch(RSI_SHIP_MATRIX_URL, {
        headers: { 'User-Agent': 'Starvis-Scraper/1.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      });
    } catch (err) {
      logger.warn(`[ship-matrix] fetch error: ${(err as Error).message}`);
      stats.errors++;
      return stats;
    }

    const ships: any[] = data?.data ?? [];
    onProgress?.(`  [ship-matrix] ${ships.length} ships from RSI`);
    if (!ships.length) return stats;

    const conn = await this.pool.connect();
    try {
      for (const ship of ships) {
        try {
          const mfg = ship.manufacturer || {};
          const media = ship.media?.[0] || {};
          const images = media.images || {};
          const storeSmall = images.store_small
            ? images.store_small.startsWith('http')
              ? images.store_small
              : `${RSI_BASE_URL}${images.store_small}`
            : null;
          const storeLarge = images.store_large
            ? images.store_large.startsWith('http')
              ? images.store_large
              : `${RSI_BASE_URL}${images.store_large}`
            : null;

          await conn.query(
            `INSERT INTO rsi.ship_matrix (
              id, name, chassis_id,
              manufacturer_code, manufacturer_name,
              focus, type, description, production_status, production_note, size, url,
              length, beam, height, mass, cargocapacity, min_crew, max_crew,
              scm_speed, afterburner_speed, pitch_max, yaw_max, roll_max,
              xaxis_acceleration, yaxis_acceleration, zaxis_acceleration,
              media_source_url, media_store_small, media_store_large, compiled
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
            ON CONFLICT (id) DO UPDATE SET
              name=EXCLUDED.name, chassis_id=EXCLUDED.chassis_id,
              manufacturer_code=EXCLUDED.manufacturer_code, manufacturer_name=EXCLUDED.manufacturer_name,
              focus=EXCLUDED.focus, type=EXCLUDED.type, description=EXCLUDED.description,
              production_status=EXCLUDED.production_status, production_note=EXCLUDED.production_note,
              size=EXCLUDED.size, url=EXCLUDED.url,
              length=EXCLUDED.length, beam=EXCLUDED.beam, height=EXCLUDED.height,
              mass=EXCLUDED.mass, cargocapacity=EXCLUDED.cargocapacity,
              min_crew=EXCLUDED.min_crew, max_crew=EXCLUDED.max_crew,
              scm_speed=EXCLUDED.scm_speed, afterburner_speed=EXCLUDED.afterburner_speed,
              pitch_max=EXCLUDED.pitch_max, yaw_max=EXCLUDED.yaw_max, roll_max=EXCLUDED.roll_max,
              xaxis_acceleration=EXCLUDED.xaxis_acceleration, yaxis_acceleration=EXCLUDED.yaxis_acceleration,
              zaxis_acceleration=EXCLUDED.zaxis_acceleration,
              media_source_url=EXCLUDED.media_source_url, media_store_small=EXCLUDED.media_store_small,
              media_store_large=EXCLUDED.media_store_large, compiled=EXCLUDED.compiled,
              synced_at=CURRENT_TIMESTAMP`,
            [
              ship.id,
              ship.name,
              ship.chassis_id || null,
              mfg.code || null,
              mfg.name || null,
              ship.focus || null,
              ship.type || null,
              ship.description || null,
              ship.production_status || null,
              ship.production_note || null,
              ship.size || null,
              ship.url || null,
              ship.length || null,
              ship.beam || null,
              ship.height || null,
              ship.mass || null,
              ship.cargocapacity || null,
              ship.min_crew ?? 1,
              ship.max_crew ?? 1,
              ship.scm_speed || null,
              ship.afterburner_speed || null,
              ship.pitch_max || null,
              ship.yaw_max || null,
              ship.roll_max || null,
              ship.xaxis_acceleration || null,
              ship.yaxis_acceleration || null,
              ship.zaxis_acceleration || null,
              media.source_url || null,
              storeSmall,
              storeLarge,
              ship.compiled ? JSON.stringify(ship.compiled) : null,
            ],
          );
          stats.synced++;
        } catch (err) {
          logger.warn(`[ship-matrix] upsert error ${ship.id}: ${(err as Error).message}`);
          stats.errors++;
        }
      }
    } finally {
      conn.release();
    }

    logger.info(`[ship-matrix] ✅ Synced ${stats.synced} ships (${stats.errors} errors)`);
    return stats;
  }

  // ── Starmap ──────────────────────────────────────────────────────────────────

  async syncStarmap(onProgress?: (msg: string) => void): Promise<{ upserted: number; errors: number }> {
    let upserted = 0;
    let errors = 0;
    const conn = await this.pool.connect();

    const upsert = async (row: {
      rsi_id: string;
      name: string;
      type: string;
      system_code: string | null;
      system_name: string | null;
      parent_id: string | null;
      faction_name: string | null;
      affiliations: string | null;
      thumbnail: string | null;
      description: string | null;
      coordinates: string | null;
      jump_points: string | null;
    }) => {
      await conn.query(
        `INSERT INTO rsi.starmap_locations (rsi_id, name, type, system_code, system_name, parent_id, faction_name, affiliations, thumbnail, description, coordinates, jump_points)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (rsi_id) DO UPDATE SET
           name=EXCLUDED.name, type=EXCLUDED.type, system_code=EXCLUDED.system_code,
           system_name=EXCLUDED.system_name, parent_id=EXCLUDED.parent_id,
           faction_name=EXCLUDED.faction_name, affiliations=EXCLUDED.affiliations,
           thumbnail=EXCLUDED.thumbnail, description=EXCLUDED.description,
           coordinates=EXCLUDED.coordinates, jump_points=EXCLUDED.jump_points,
           synced_at=NOW()`,
        [
          row.rsi_id,
          row.name,
          row.type,
          row.system_code,
          row.system_name,
          row.parent_id,
          row.faction_name,
          row.affiliations,
          row.thumbnail,
          row.description,
          row.coordinates,
          row.jump_points,
        ],
      );
    };

    try {
      let page = 1;
      while (true) {
        const url = `${SC_WIKI_API_URL}/starsystems?page[number]=${page}&limit=100`;
        onProgress?.(`  [starmap] systems page ${page}…`);

        let data: any;
        try {
          data = await fetchJson(url);
        } catch (err) {
          logger.warn(`[starmap] fetch error page ${page}: ${(err as Error).message}`);
          errors++;
          break;
        }

        const systems: any[] = data.data ?? [];
        if (systems.length === 0) break;
        if (page === 1) onProgress?.(`  [starmap] total systems: ~${data.meta?.total ?? '?'}`);

        for (const sys of systems) {
          const systemCode: string | null = sys.code ?? null;
          const rsiId = String(sys.id ?? sys.rsi_id ?? sys.code ?? '');

          try {
            await upsert({
              rsi_id: rsiId,
              name: String(sys.name ?? rsiId),
              type: 'star',
              system_code: systemCode,
              system_name: sys.name ?? null,
              parent_id: null,
              faction_name: sys.affiliation?.[0]?.name ?? null,
              affiliations: sys.affiliation ? JSON.stringify(sys.affiliation.map((a: any) => a.name ?? a.code ?? a)) : null,
              thumbnail: sys.thumbnail?.url ?? null,
              description: sys.description ?? null,
              coordinates: sys.position ? JSON.stringify({ x: sys.position.x, y: sys.position.y, z: sys.position.z }) : null,
              jump_points: sys.jumppoints ? JSON.stringify(sys.jumppoints.map((j: any) => j.code ?? j)) : null,
            });
            upserted++;
          } catch (err) {
            logger.warn(`[starmap] upsert error system ${rsiId}: ${(err as Error).message}`);
            errors++;
          }

          // Celestial bodies for this system
          if (sys.code && sys.system_api_url) {
            try {
              const bodiesData = await fetchJson(`${sys.system_api_url}?with=celestialObjects`);
              const bodies: any[] =
                bodiesData.data?.celestial_objects ?? bodiesData.data?.celestialObjects ?? bodiesData.celestial_objects ?? [];
              for (const body of bodies) {
                const bodyRsiId = String(body.id ?? body.rsi_id ?? '');
                if (!bodyRsiId) continue;
                try {
                  await upsert({
                    rsi_id: bodyRsiId,
                    name: String(body.name ?? bodyRsiId),
                    type: (body.type ?? 'unknown').toLowerCase(),
                    system_code: systemCode,
                    system_name: sys.name ?? null,
                    parent_id: body.parent_id ? String(body.parent_id) : rsiId,
                    faction_name: body.affiliation?.[0]?.name ?? null,
                    affiliations: body.affiliation ? JSON.stringify(body.affiliation.map((a: any) => a.name ?? a)) : null,
                    thumbnail: body.thumbnail?.url ?? null,
                    description: body.description ?? null,
                    coordinates: null,
                    jump_points: null,
                  });
                  upserted++;
                } catch (err) {
                  logger.warn(`[starmap] upsert error body ${bodyRsiId}: ${(err as Error).message}`);
                  errors++;
                }
              }
            } catch {
              // system may not have detail data
            }
          }
        }

        if (!data.meta?.last_page || page >= data.meta.last_page) break;
        page++;
      }
    } finally {
      conn.release();
    }
    return { upserted, errors };
  }
}
