/**
 * RsiSyncService — Synchronise les données RSI vers rsi.*.
 *
 * Modules:
 *   galactapedia   → rsi.galactapedia  (source: RSI officiel via Playwright)
 *   comm-links     → rsi.comm_links    (source: RSI officiel API POST)
 *   starmap        → rsi.starmap_locations
 *
 * Toutes les sources tierces (SC Wiki, etc.) ont été supprimées.
 */
import type { Pool } from 'pg';
import { RSI_BASE_URL, RSI_SHIP_MATRIX_URL, SCRAPER_USER_AGENT } from '../config.js';
import logger from '../logger.js';
import { scrapeCommLinkContent, scrapeGalactapediaContent } from '../scrapers/rsi-content-scraper.js';

const RSI_ORGS_API_URL = `${RSI_BASE_URL}/api/orgs/getOrgs`;

interface RsiOrgSummary {
  symbol: string;
  name: string;
  logoUrl: string | null;
  archetype: string | null;
  language: string | null;
  commitment: string | null;
  recruiting: boolean;
  roleplay: boolean;
  memberCount: number | null;
}

async function postJson(url: string, body: unknown = {}): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': SCRAPER_USER_AGENT },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

function json(value: unknown): string | null {
  return value == null ? null : JSON.stringify(value);
}

function sqlDate(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeStarmapObjectType(type: unknown): string {
  const normalized = String(type ?? 'unknown')
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (normalized === 'satellite') return 'moon';
  if (normalized === 'jumppoint') return 'jump_point';
  if (normalized === 'asteroid_belt' || normalized === 'asteroid_field') return 'asteroid_field';
  if (normalized === 'manmade') return 'station';
  return normalized;
}

function starmapObjectName(body: any): string {
  return String(body.name ?? body.designation ?? body.code ?? body.id);
}

function starmapObjectParentId(body: any, systemRsiId: string): string {
  return body.parent_id ? String(body.parent_id) : systemRsiId;
}

function detailedStarmapSystem(data: any): any | null {
  return data?.data?.resultset?.[0] ?? data?.data?.systems?.resultset?.[0] ?? data?.data ?? null;
}

function mergeStarmapBodies(primary: any[], fallback: any[]): any[] {
  const merged = new Map<string, any>();
  for (const body of fallback) {
    const key = String(body.id ?? body.code ?? '');
    if (key) merged.set(key, body);
  }
  for (const body of primary) {
    const key = String(body.id ?? body.code ?? '');
    if (key) merged.set(key, { ...(merged.get(key) ?? {}), ...body });
  }
  return [...merged.values()];
}

function markdownToHtml(md: string): string {
  let html = md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  html = html
    .split(/\n{2,}/)
    .map((p) => {
      p = p.trim();
      if (!p) return '';
      if (/^<h[1-6]|^<ul|^<ol|^<table|^<blockquote/.test(p)) return p;
      return `<p>${p.replace(/\n/g, '<br />')}</p>`;
    })
    .filter(Boolean)
    .join('\n');

  return html;
}

function resolveRsiUrl(src: string | null | undefined): string | null {
  if (!src) return null;
  if (src.startsWith('http')) return src;
  if (src.startsWith('/')) return `${RSI_BASE_URL}${src}`;
  return null;
}

function parseOrganizationsHtml(html: string): RsiOrgSummary[] {
  const orgs: RsiOrgSummary[] = [];
  const cells = html.split(/<div class="org-cell[^"]*">/);
  for (const cell of cells.slice(1)) {
    const name = cell.match(/class="trans-03s name">([^<]+)/)?.[1]?.trim() ?? null;
    const symbol = cell.match(/class="symbol">([^<]+)/)?.[1]?.trim() ?? null;
    if (!name || !symbol) continue;
    const logoSrc = cell.match(/<span class="thumb">\s*<img src="([^"]+)"/)?.[1] ?? null;
    const recruiting = cell.match(/Recruiting: <\/span><span class="value[^"]*">([^<]+)/)?.[1]?.trim() === 'Yes';
    const roleplay = cell.match(/Role play: <\/span><span class="value[^"]*">([^<]+)/)?.[1]?.trim() === 'Yes';
    const memberCountRaw = cell.match(/Members: <\/span><span class="value">([^<]+)/)?.[1]?.trim() ?? null;
    orgs.push({
      symbol,
      name,
      logoUrl: resolveRsiUrl(logoSrc),
      archetype: cell.match(/Archetype: <\/span><span class="value">([^<]+)/)?.[1]?.trim() ?? null,
      language: cell.match(/Lang: <\/span><span class="value">([^<]+)/)?.[1]?.trim() ?? null,
      commitment: cell.match(/Commitment: <\/span><span class="value[^"]*">([^<]+)/)?.[1]?.trim() ?? null,
      recruiting,
      roleplay,
      memberCount: memberCountRaw ? Number.parseInt(memberCountRaw, 10) : null,
    });
  }
  return orgs;
}

async function fetchOrganizationBySymbol(symbol: string): Promise<RsiOrgSummary | null> {
  const res = await fetch(RSI_ORGS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': SCRAPER_USER_AGENT },
    body: JSON.stringify({
      sort: 'SIZE',
      commitment: '',
      roleplay: '',
      membercount: '',
      archetype: '',
      language: '',
      recruiting: '',
      search: symbol,
      pagesize: 5,
      page: 1,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { success?: number; data?: { html?: string } };
  if (!data.success) throw new Error('RSI organizations API returned failure');
  return parseOrganizationsHtml(data.data?.html ?? '').find((org) => org.symbol.toUpperCase() === symbol.toUpperCase()) ?? null;
}

export interface SyncStats {
  inserted: number;
  updated: number;
  errors: number;
}

export class RsiSyncService {
  constructor(private pool: Pool) {}

  async syncOrganizations(onProgress?: (msg: string) => void): Promise<{ updated: number; skipped: number; errors: number }> {
    const stats = { updated: 0, skipped: 0, errors: 0 };
    const conn = await this.pool.connect();
    try {
      const { rows } = await conn.query<{ id: number; tag: string }>(
        "SELECT id, tag FROM meta.corporations WHERE tag IS NOT NULL AND tag != '' ORDER BY tag",
      );
      onProgress?.(`  [organizations] ${rows.length} cached corporation(s) to refresh`);
      for (const row of rows) {
        try {
          const org = await fetchOrganizationBySymbol(row.tag);
          if (!org) {
            stats.skipped++;
            onProgress?.(`  [organizations] ${row.tag}: not found on RSI`);
            continue;
          }
          await conn.query(
            `UPDATE meta.corporations SET
              name = $1,
              logo_url = $2,
              rsi_archetype = $3,
              rsi_language = $4,
              rsi_commitment = $5,
              rsi_recruiting = $6,
              rsi_roleplay = $7,
              rsi_member_count = $8,
              rsi_synced_at = NOW(),
              updated_at = NOW()
             WHERE id = $9`,
            [org.name, org.logoUrl, org.archetype, org.language, org.commitment, org.recruiting, org.roleplay, org.memberCount, row.id],
          );
          stats.updated++;
          onProgress?.(`  [organizations] ${row.tag}: updated`);
        } catch (err) {
          logger.warn(`[organizations] sync error ${row.tag}: ${(err as Error).message}`);
          stats.errors++;
        }
      }
    } finally {
      conn.release();
    }
    return stats;
  }

  // ── Galactapedia — source officielle RSI (GraphQL API) ──────────────────────

  async syncGalactapedia(onProgress?: (msg: string) => void): Promise<SyncStats> {
    const stats: SyncStats = { inserted: 0, updated: 0, errors: 0 };
    const GRAPHQL_URL = `${RSI_BASE_URL}/galactapedia/graphql`;
    const PAGE_SIZE = 100;
    let skip = 0;
    let totalCount: number | null = null;
    const allArticles: any[] = [];

    while (true) {
      let data: any;
      let fetchErr: Error | null = null;
      const BACKOFFS = [0, 10_000, 30_000];
      for (let attempt = 0; attempt < BACKOFFS.length; attempt++) {
        try {
          if (BACKOFFS[attempt]) await new Promise((r) => setTimeout(r, BACKOFFS[attempt]));
          const res = await fetch(GRAPHQL_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              Origin: RSI_BASE_URL,
              Referer: `${RSI_BASE_URL}/galactapedia`,
            },
            body: JSON.stringify({
              query: `{
                allArticle(first: ${PAGE_SIZE}, skip: ${skip}) {
                  totalCount
                  pageInfo { hasNextPage }
                  edges {
                    node {
                      id title slug body
                    }
                  }
                }
              }`,
            }),
            signal: AbortSignal.timeout(30_000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          data = await res.json();
          fetchErr = null;
          break;
        } catch (err) {
          fetchErr = err as Error;
          logger.warn(`[galactapedia] GraphQL fetch attempt ${attempt + 1} at skip=${skip}: ${fetchErr.message}`);
          if (!fetchErr.message.startsWith('HTTP ')) break; // network error — no point retrying
        }
      }
      if (fetchErr) {
        stats.errors++;
        break;
      }

      const page = data?.data?.allArticle;
      if (!page) {
        logger.warn('[galactapedia] Unexpected GraphQL response shape');
        stats.errors++;
        break;
      }

      if (totalCount === null) {
        totalCount = page.totalCount ?? 0;
        onProgress?.(`  [galactapedia] ${totalCount} articles from RSI GraphQL`);
      }

      const edges: any[] = page.edges ?? [];
      for (const edge of edges) {
        if (edge?.node) allArticles.push(edge.node);
      }

      if (!page.pageInfo?.hasNextPage || edges.length === 0) break;
      skip += PAGE_SIZE;
      await new Promise((r) => setTimeout(r, 150));
    }

    onProgress?.(`  [galactapedia] ${allArticles.length} articles fetched`);

    const conn = await this.pool.connect();
    try {
      for (const article of allArticles) {
        const id = String(article.id ?? '');
        const slug = String(article.slug ?? '');
        if (!id) continue;

        const title = String(article.title ?? slug ?? id);
        const rsiUrl = `${RSI_BASE_URL}/galactapedia/article/${id}-${slug}`;

        const content = article.body ? markdownToHtml(String(article.body)) : null;

        try {
          const result = await conn.query<any>(
            `INSERT INTO rsi.galactapedia (
               id, slug, title, content, excerpt, type, template, categories, tags,
               categories_count, tags_count, related_articles_count,
               thumbnail_url, rsi_url, api_url, web_url, source_created_at, raw_json
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
             ON CONFLICT (id) DO UPDATE SET
               slug=EXCLUDED.slug, title=EXCLUDED.title,
               content=COALESCE(EXCLUDED.content, rsi.galactapedia.content),
               rsi_url=EXCLUDED.rsi_url,
               updated_at=NOW()`,
            [id, slug, title, content, null, null, null, null, null, null, null, null, null, rsiUrl, null, null, null, json(article)],
          );
          if (result.rowCount === 1) stats.inserted++;
          else stats.updated++;
        } catch (err) {
          logger.warn(`[galactapedia] upsert error ${id}: ${(err as Error).message}`);
          stats.errors++;
        }
      }
    } finally {
      conn.release();
    }
    return stats;
  }

  // ── Comm-links — source officielle RSI (API POST) ────────────────────────────

  async syncCommLinks(onProgress?: (msg: string) => void): Promise<SyncStats> {
    const stats: SyncStats = { inserted: 0, updated: 0, errors: 0 };

    // RSI official comm-link API — same endpoint used by robertsspaceindustries.com
    const API_URL = `${RSI_BASE_URL}/api/comm-link/getCommunications`;
    const PAGE_SIZE = 20;
    let start = 0;
    let total: number | null = null;

    const conn = await this.pool.connect();
    try {
      while (true) {
        onProgress?.(`  [comm-links] fetching RSI API start=${start}…`);

        let data: any;
        try {
          const res = await fetch(API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': SCRAPER_USER_AGENT,
              Accept: 'application/json',
            },
            body: JSON.stringify({ start, end: start + PAGE_SIZE, id: 0, channel: 0, sort: 'publish_new', search: '' }),
            signal: AbortSignal.timeout(30_000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          data = await res.json();
        } catch (err) {
          logger.warn(`[comm-links] RSI API error at start=${start}: ${(err as Error).message}`);
          stats.errors++;
          break;
        }

        const items: any[] = data.data ?? [];
        if (items.length === 0) break;

        if (total === null) {
          total = Number(data.totalrows ?? data.total ?? 0);
          onProgress?.(`  [comm-links] RSI total: ${total}`);
        }

        for (const item of items) {
          const rsiId = String(item.id ?? '');
          if (!rsiId) continue;

          const urlPath: string = item.url ?? '';
          const rsiUrl = urlPath.startsWith('http') ? urlPath : `${RSI_BASE_URL}${urlPath}`;
          const slug = urlPath.split('/').pop() ?? null;
          const channel = item.channel_name ?? item.channel ?? null;
          const category = channel && channel !== 'Undefined' ? channel : null;
          const publishedAtSql = sqlDate(item.time ?? item.published_at ?? null);
          const thumbRaw: string | null = item.background ?? item.thumb ?? item.thumbnail ?? null;
          const thumbnailUrl = thumbRaw ? (thumbRaw.startsWith('http') ? thumbRaw : `${RSI_BASE_URL}${thumbRaw}`) : null;

          try {
            const result = await conn.query<any>(
              `INSERT INTO rsi.comm_links (
                 rsi_id, slug, title, content, excerpt, category, source_category, channel, series,
                 thumbnail_url, rsi_url, api_url, api_public_url,
                 images_count, links_count, comment_count, raw_json, published_at
               )
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
               ON CONFLICT (rsi_id) DO UPDATE SET
                 slug=EXCLUDED.slug, title=EXCLUDED.title,
                 content=CASE WHEN rsi.comm_links.content LIKE '%<p%' OR rsi.comm_links.content LIKE '%<img%'
                              THEN rsi.comm_links.content ELSE EXCLUDED.content END,
                 excerpt=COALESCE(rsi.comm_links.excerpt, EXCLUDED.excerpt),
                 category=EXCLUDED.category, source_category=EXCLUDED.source_category,
                 channel=EXCLUDED.channel,
                 thumbnail_url=COALESCE(EXCLUDED.thumbnail_url, rsi.comm_links.thumbnail_url),
                 rsi_url=EXCLUDED.rsi_url, raw_json=EXCLUDED.raw_json,
                 published_at=EXCLUDED.published_at`,
              [
                rsiId,
                slug,
                String(item.title ?? item.name ?? rsiId),
                null,
                null,
                category,
                category,
                channel,
                null,
                thumbnailUrl,
                rsiUrl,
                null,
                null,
                null,
                null,
                item.post_count ? Number(item.post_count) : null,
                json(item),
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

        start += PAGE_SIZE;
        if (total !== null && start >= total) break;
        if (items.length < PAGE_SIZE) break;

        await new Promise((r) => setTimeout(r, 200));
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
          // The ship-matrix pledge URL is a relative path (e.g.
          // "/pledge/ships/aurora/Aurora-MR"); store it absolute so IHM links
          // resolve to the real RSI store instead of 404ing on our host.
          const storeUrl = ship.url
            ? ship.url.startsWith('http')
              ? ship.url
              : `${RSI_BASE_URL}${ship.url.startsWith('/') ? '' : '/'}${ship.url}`
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
              storeUrl,
              ship.length || null,
              ship.beam || null,
              ship.height || null,
              ship.mass != null ? Math.round(ship.mass) : null,
              ship.cargocapacity != null ? Math.round(ship.cargocapacity) : null,
              Math.round(ship.min_crew ?? 1),
              Math.round(ship.max_crew ?? 1),
              ship.scm_speed != null ? Math.round(ship.scm_speed) : null,
              ship.afterburner_speed != null ? Math.round(ship.afterburner_speed) : null,
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
      status: string | null;
      star_type: string | null;
      system_code: string | null;
      system_name: string | null;
      parent_id: string | null;
      faction_name: string | null;
      affiliations: string | null;
      thumbnail: string | null;
      description: string | null;
      web_url: string | null;
      coordinates: string | null;
      aggregated: string | null;
      size: number | null;
      population: number | null;
      economy: number | null;
      danger: number | null;
      frost_line: number | null;
      habitable_zone_inner: number | null;
      habitable_zone_outer: number | null;
      jump_points: string | null;
      raw_json: string | null;
      source_updated_at: string | null;
    }) => {
      await conn.query(
        `INSERT INTO rsi.starmap_locations (
           rsi_id, name, type, status, star_type, system_code, system_name, parent_id,
           faction_name, affiliations, thumbnail, description, web_url, coordinates, aggregated,
           size, population, economy, danger, frost_line, habitable_zone_inner, habitable_zone_outer,
           jump_points, raw_json, source_updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
         ON CONFLICT (rsi_id) DO UPDATE SET
           name=EXCLUDED.name, type=EXCLUDED.type, status=EXCLUDED.status, star_type=EXCLUDED.star_type,
           system_code=EXCLUDED.system_code,
           system_name=EXCLUDED.system_name, parent_id=EXCLUDED.parent_id,
           faction_name=EXCLUDED.faction_name, affiliations=EXCLUDED.affiliations,
           thumbnail=COALESCE(EXCLUDED.thumbnail, rsi.starmap_locations.thumbnail),
           description=COALESCE(EXCLUDED.description, rsi.starmap_locations.description),
           web_url=COALESCE(EXCLUDED.web_url, rsi.starmap_locations.web_url),
           coordinates=COALESCE(EXCLUDED.coordinates, rsi.starmap_locations.coordinates),
           aggregated=COALESCE(EXCLUDED.aggregated, rsi.starmap_locations.aggregated),
           size=EXCLUDED.size, population=EXCLUDED.population, economy=EXCLUDED.economy, danger=EXCLUDED.danger,
           frost_line=COALESCE(EXCLUDED.frost_line, rsi.starmap_locations.frost_line),
           habitable_zone_inner=COALESCE(EXCLUDED.habitable_zone_inner, rsi.starmap_locations.habitable_zone_inner),
           habitable_zone_outer=COALESCE(EXCLUDED.habitable_zone_outer, rsi.starmap_locations.habitable_zone_outer),
           jump_points=COALESCE(EXCLUDED.jump_points, rsi.starmap_locations.jump_points),
           raw_json=EXCLUDED.raw_json,
           source_updated_at=COALESCE(EXCLUDED.source_updated_at, rsi.starmap_locations.source_updated_at),
           synced_at=NOW()`,
        [
          row.rsi_id,
          row.name,
          row.type,
          row.status,
          row.star_type,
          row.system_code,
          row.system_name,
          row.parent_id,
          row.faction_name,
          row.affiliations,
          row.thumbnail,
          row.description,
          row.web_url,
          row.coordinates,
          row.aggregated,
          row.size,
          row.population,
          row.economy,
          row.danger,
          row.frost_line,
          row.habitable_zone_inner,
          row.habitable_zone_outer,
          row.jump_points,
          row.raw_json,
          row.source_updated_at,
        ],
      );
    };

    try {
      // ── Step 1: fetch all systems from the RSI starmap bootup API ─────────
      const bootupUrl = `${RSI_BASE_URL}/api/starmap/bootup`;
      onProgress?.(`  [starmap] fetching from RSI API…`);

      let bootupData: any;
      try {
        bootupData = await postJson(bootupUrl);
      } catch (err) {
        logger.warn(`[starmap] bootup fetch error: ${(err as Error).message}`);
        errors++;
        return { upserted, errors };
      }

      const systems: any[] = bootupData.data?.systems?.resultset ?? [];
      if (systems.length === 0) {
        logger.warn('[starmap] RSI bootup returned no systems');
        return { upserted, errors };
      }
      onProgress?.(`  [starmap] ${systems.length} systems from RSI`);

      // ── Step 2: upsert each system ──────────────────────────────────────────────
      for (const sys of systems) {
        const rsiId = String(sys.id ?? '');
        const systemCode: string | null = sys.code ?? null;
        if (!rsiId) continue;

        // Jump points: store destination system codes for drawing connections
        const jumpPoints = Array.isArray(sys.jumppoints)
          ? sys.jumppoints
              .map((jp: any) => ({
                id: String(jp.id ?? ''),
                direction: jp.direction ?? 'BIDIRECTIONAL',
                status: jp.status ?? null,
                exitSystemCode: jp.exit_system?.code ?? null,
                exitSystemName: jp.exit_system?.name ?? null,
              }))
              .filter((jp: any) => jp.exitSystemCode)
          : [];

        // Description: RSI returns an object with language keys
        const description =
          typeof sys.description === 'object' && sys.description !== null
            ? (sys.description.en_EN ?? Object.values(sys.description)[0] ?? null)
            : (sys.description ?? null);

        try {
          await upsert({
            rsi_id: rsiId,
            name: String(sys.name ?? rsiId),
            type: 'system',
            status: sys.status ?? null,
            star_type: sys.type ?? null,
            system_code: systemCode,
            system_name: sys.name ?? null,
            parent_id: null,
            faction_name: sys.affiliation?.[0]?.name ?? null,
            affiliations: json((sys.affiliation ?? []).map((a: any) => a.name).filter(Boolean)),
            thumbnail: sys.thumbnail?.images?.product_thumb_large ?? sys.thumbnail?.images?.post ?? sys.thumbnail?.url ?? null,
            description: typeof description === 'string' ? description : null,
            web_url: systemCode ? `${RSI_BASE_URL}/starmap/systems/${systemCode}` : null,
            coordinates: json(
              sys.position_x !== undefined
                ? { x: Number(sys.position_x), y: Number(sys.position_y ?? 0), z: Number(sys.position_z ?? 0) }
                : sys.position
                  ? { x: Number(sys.position.x), y: Number(sys.position.y), z: Number(sys.position.z) }
                  : null,
            ),
            aggregated: json({
              size: sys.aggregated_size,
              population: sys.aggregated_population,
              economy: sys.aggregated_economy,
              danger: sys.aggregated_danger,
            }),
            size: sys.aggregated_size ?? null,
            population: sys.aggregated_population ?? null,
            economy: sys.aggregated_economy ?? null,
            danger: sys.aggregated_danger ?? null,
            frost_line: sys.frost_line ?? null,
            habitable_zone_inner: sys.habitable_zone_inner ?? null,
            habitable_zone_outer: sys.habitable_zone_outer ?? null,
            jump_points: jumpPoints.length > 0 ? json(jumpPoints) : null,
            raw_json: json(sys),
            source_updated_at: sqlDate(sys.time_modified),
          });
          upserted++;
          onProgress?.(`  [starmap] ✓ ${sys.name ?? rsiId}${jumpPoints.length > 0 ? ` (${jumpPoints.length} jumps)` : ''}`);
        } catch (err) {
          logger.warn(`[starmap] upsert error system ${rsiId}: ${(err as Error).message}`);
          errors++;
        }

        // ── Step 3: fetch ARK map objects for this system ─────────────────────────
        if (systemCode) {
          try {
            const sysUrl = `${RSI_BASE_URL}/api/starmap/star-systems/${systemCode}`;
            const sysData = await postJson(sysUrl);
            const detailedSystem = detailedStarmapSystem(sysData);
            const detailedBodies: any[] = detailedSystem?.celestial_objects ?? [];

            const findUrl = `${RSI_BASE_URL}/api/starmap/find`;
            const findData = await postJson(findUrl, { query: sys.name ?? systemCode });
            const foundBodies: any[] = (findData.data?.objects?.resultset ?? []).filter(
              (body: any) => String(body.star_system?.code ?? '').toUpperCase() === systemCode.toUpperCase(),
            );

            const bodies = mergeStarmapBodies(detailedBodies, foundBodies);

            for (const body of bodies) {
              const bodyId = String(body.id ?? '');
              if (!bodyId) continue;

              const bodyDesc =
                typeof body.description === 'object' && body.description !== null
                  ? (body.description.en_EN ?? Object.values(body.description)[0] ?? null)
                  : (body.description ?? null);

              try {
                await upsert({
                  rsi_id: bodyId,
                  name: starmapObjectName(body),
                  type: normalizeStarmapObjectType(body.type),
                  status: body.status ?? null,
                  star_type: null,
                  system_code: systemCode,
                  system_name: sys.name ?? null,
                  parent_id: starmapObjectParentId(body, rsiId),
                  faction_name: body.affiliation?.[0]?.name ?? null,
                  affiliations: json((body.affiliation ?? []).map((a: any) => a.name).filter(Boolean)),
                  thumbnail: body.thumbnail?.images?.product_thumb_large ?? body.thumbnail?.images?.post ?? body.thumbnail?.url ?? null,
                  description: typeof bodyDesc === 'string' ? bodyDesc : null,
                  web_url: null,
                  coordinates: json(
                    body.position ? { x: Number(body.position.x), y: Number(body.position.y), z: Number(body.position.z) } : null,
                  ),
                  aggregated: null,
                  size: body.size ?? null,
                  population: null,
                  economy: null,
                  danger: null,
                  frost_line: null,
                  habitable_zone_inner: null,
                  habitable_zone_outer: null,
                  jump_points: null,
                  raw_json: json(body),
                  source_updated_at: sqlDate(body.time_modified),
                });
                upserted++;
              } catch (err) {
                logger.warn(`[starmap] upsert error body ${bodyId}: ${(err as Error).message}`);
                errors++;
              }
            }
            onProgress?.(`  [starmap]   ${bodies.length} ARK objects`);
          } catch {
            // system may not expose celestial detail
          }
        }
      }
    } finally {
      conn.release();
    }
    return { upserted, errors };
  }

  // ── RSI rich-content enrichment ───────────────────────────────────────────

  /**
   * Fetch the real RSI HTML for comm-links that still have SC Wiki plain text.
   * Entries with HTML content (detected by presence of '<p') are skipped.
   */
  async enrichCommLinksContent(
    opts: { delayMs?: number; limit?: number } = {},
    onProgress?: (msg: string) => void,
  ): Promise<{ enriched: number; skipped: number; errors: number }> {
    const { delayMs = 400, limit = 0 } = opts;
    const conn = await this.pool.connect();
    const stats = { enriched: 0, skipped: 0, errors: 0 };

    try {
      const limitClause = limit > 0 ? `LIMIT ${limit}` : '';
      const rows = await conn.query<{ rsi_id: string; rsi_url: string }>(
        `SELECT rsi_id, rsi_url FROM rsi.comm_links
         WHERE rsi_url IS NOT NULL
           AND (content IS NULL OR (content NOT LIKE '%<p%' AND content NOT LIKE '%<img%'))
         ORDER BY published_at DESC ${limitClause}`,
      );

      const total = rows.rows.length;
      onProgress?.(`  [rsi-content] comm-links to enrich: ${total}`);

      for (let i = 0; i < rows.rows.length; i++) {
        const { rsi_id, rsi_url } = rows.rows[i];
        onProgress?.(`  [rsi-content] comm-link ${i + 1}/${total}: ${rsi_url}`);

        try {
          const html = await scrapeCommLinkContent(rsi_url);
          if (html) {
            await conn.query(`UPDATE rsi.comm_links SET content = $1 WHERE rsi_id = $2`, [html, rsi_id]);
            stats.enriched++;
          } else {
            stats.skipped++;
          }
        } catch (err) {
          logger.warn(`[rsi-content] comm-link ${rsi_id}: ${(err as Error).message}`);
          stats.errors++;
        }

        if (delayMs > 0 && i < rows.rows.length - 1) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    } finally {
      conn.release();
    }
    return stats;
  }

  /**
   * Fetch the real RSI HTML for galactapedia entries that still have plain text.
   */
  async enrichGalactapediaContent(
    opts: { delayMs?: number; limit?: number } = {},
    onProgress?: (msg: string) => void,
  ): Promise<{ enriched: number; skipped: number; errors: number }> {
    const { delayMs = 400, limit = 0 } = opts;
    const conn = await this.pool.connect();
    const stats = { enriched: 0, skipped: 0, errors: 0 };

    try {
      const limitClause = limit > 0 ? `LIMIT ${limit}` : '';
      const rows = await conn.query<{ id: string; rsi_url: string }>(
        `SELECT id, rsi_url FROM rsi.galactapedia
         WHERE rsi_url IS NOT NULL
           AND (content IS NULL OR (content NOT LIKE '%<p%' AND content NOT LIKE '%<img%'))
         ORDER BY updated_at DESC ${limitClause}`,
      );

      const total = rows.rows.length;
      onProgress?.(`  [rsi-content] galactapedia to enrich: ${total}`);

      for (let i = 0; i < rows.rows.length; i++) {
        const { id, rsi_url } = rows.rows[i];
        onProgress?.(`  [rsi-content] galactapedia ${i + 1}/${total}: ${rsi_url}`);

        try {
          const html = await scrapeGalactapediaContent(rsi_url);
          if (html) {
            await conn.query(`UPDATE rsi.galactapedia SET content = $1 WHERE id = $2`, [html, id]);
            stats.enriched++;
          } else {
            stats.skipped++;
          }
        } catch (err) {
          logger.warn(`[rsi-content] galactapedia ${id}: ${(err as Error).message}`);
          stats.errors++;
        }

        if (delayMs > 0 && i < rows.rows.length - 1) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    } finally {
      conn.release();
    }
    return stats;
  }
}
