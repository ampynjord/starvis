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

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': SCRAPER_USER_AGENT },
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

function sourceList(value: unknown): string[] | null {
  if (Array.isArray(value))
    return value
      .map((item: any) => item.name ?? item.code ?? item)
      .filter(Boolean)
      .map(String);
  if (typeof value === 'string' && value.trim())
    return value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  return null;
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
          const categories = json(sourceList(item.categories ?? item.category));
          const tags = json(sourceList(item.tags ?? item.tag));
          const thumbnailUrl = item.thumbnail?.url ?? item.thumbnail ?? null;
          const rsiUrl = `${RSI_BASE_URL}/galactapedia/article/${id}-${slug}`;

          try {
            const result = await conn.query<any>(
              `INSERT INTO rsi.galactapedia (
                 id, slug, title, content, excerpt, type, template, categories, tags,
                 categories_count, tags_count, related_articles_count,
                 thumbnail_url, rsi_url, api_url, web_url, source_created_at, raw_json
               )
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
               ON CONFLICT (id) DO UPDATE SET
                 slug=EXCLUDED.slug, title=EXCLUDED.title, content=EXCLUDED.content, excerpt=EXCLUDED.excerpt,
                 type=EXCLUDED.type, template=EXCLUDED.template, categories=EXCLUDED.categories, tags=EXCLUDED.tags,
                 categories_count=EXCLUDED.categories_count, tags_count=EXCLUDED.tags_count,
                 related_articles_count=EXCLUDED.related_articles_count,
                 thumbnail_url=EXCLUDED.thumbnail_url, rsi_url=EXCLUDED.rsi_url,
                 api_url=EXCLUDED.api_url, web_url=EXCLUDED.web_url,
                 source_created_at=EXCLUDED.source_created_at, raw_json=EXCLUDED.raw_json,
                 updated_at=NOW()`,
              [
                String(id),
                String(slug),
                String(item.title ?? item.name ?? slug),
                content,
                excerpt,
                item.type ?? null,
                item.template ?? null,
                categories,
                tags,
                item.categories_count ?? null,
                item.tags_count ?? null,
                item.related_articles_count ?? null,
                thumbnailUrl,
                item.rsi_url ? `${RSI_BASE_URL}${item.rsi_url}` : rsiUrl,
                item.api_url ?? null,
                item.web_url ?? null,
                sqlDate(item.created_at),
                json(item),
              ],
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
          const channel = item.channel && item.channel !== 'Undefined' ? item.channel : null;
          const sourceCategory = item.category && item.category !== 'Undefined' ? item.category : null;
          const category = channel ?? sourceCategory;
          const excerpt = content ? (content as string).slice(0, 400).replace(/\n/g, ' ') : null;
          const publishedAt = item.published_at ?? item.created_at ?? item.time ?? null;
          const publishedAtSql = sqlDate(publishedAt);

          try {
            const result = await conn.query<any>(
              `INSERT INTO rsi.comm_links (
                 rsi_id, slug, title, content, excerpt, category, source_category, channel, series,
                 thumbnail_url, rsi_url, api_url, api_public_url,
                 images_count, links_count, comment_count, raw_json, published_at
               )
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
               ON CONFLICT (rsi_id) DO UPDATE SET
                 slug=EXCLUDED.slug, title=EXCLUDED.title, content=EXCLUDED.content,
                 excerpt=EXCLUDED.excerpt, category=EXCLUDED.category, source_category=EXCLUDED.source_category,
                 channel=EXCLUDED.channel, series=EXCLUDED.series,
                 thumbnail_url=EXCLUDED.thumbnail_url, rsi_url=EXCLUDED.rsi_url,
                 api_url=EXCLUDED.api_url, api_public_url=EXCLUDED.api_public_url,
                 images_count=EXCLUDED.images_count, links_count=EXCLUDED.links_count,
                 comment_count=EXCLUDED.comment_count, raw_json=EXCLUDED.raw_json,
                 published_at=EXCLUDED.published_at`,
              [
                rsiId,
                slug,
                String(item.title ?? item.name ?? rsiId),
                content,
                excerpt,
                category,
                sourceCategory,
                channel,
                item.series && item.series !== 'None' ? item.series : null,
                item.thumbnail?.url ?? item.image ?? null,
                item.rsi_url ?? `${RSI_BASE_URL}/comm-link/${rsiId}`,
                item.api_url ?? null,
                item.api_public_url ?? null,
                item.images_count ?? null,
                item.links_count ?? null,
                item.comment_count ?? null,
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
           thumbnail=EXCLUDED.thumbnail, description=EXCLUDED.description, web_url=EXCLUDED.web_url,
           coordinates=EXCLUDED.coordinates, aggregated=EXCLUDED.aggregated,
           size=EXCLUDED.size, population=EXCLUDED.population, economy=EXCLUDED.economy, danger=EXCLUDED.danger,
           frost_line=EXCLUDED.frost_line, habitable_zone_inner=EXCLUDED.habitable_zone_inner,
           habitable_zone_outer=EXCLUDED.habitable_zone_outer,
           jump_points=EXCLUDED.jump_points, raw_json=EXCLUDED.raw_json,
           source_updated_at=EXCLUDED.source_updated_at,
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
      // ── Step 1: fetch all systems from RSI official starmap bootup API ─────────
      const bootupUrl = `${RSI_BASE_URL}/api/starmap/bootup`;
      onProgress?.(`  [starmap] fetching from RSI official API…`);

      let bootupData: any;
      try {
        bootupData = await fetchJson(bootupUrl);
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
            type: 'StarSystem',
            status: sys.status ?? null,
            star_type: sys.type ?? null,
            system_code: systemCode,
            system_name: sys.name ?? null,
            parent_id: null,
            faction_name: sys.affiliation?.[0]?.name ?? null,
            affiliations: json((sys.affiliation ?? []).map((a: any) => a.name).filter(Boolean)),
            thumbnail: sys.thumbnail?.url ?? null,
            description: typeof description === 'string' ? description : null,
            web_url: systemCode ? `${RSI_BASE_URL}/starmap/systems/${systemCode}` : null,
            coordinates: json(sys.position ? { x: Number(sys.position.x), y: Number(sys.position.y), z: Number(sys.position.z) } : null),
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

        // ── Step 3: fetch celestial objects for this system ───────────────────────
        if (systemCode) {
          try {
            const sysUrl = `${RSI_BASE_URL}/api/starmap/star-systems/${systemCode}`;
            const sysData = await fetchJson(sysUrl);
            const bodies: any[] = sysData.data?.celestial_objects ?? [];

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
                  name: String(body.name ?? bodyId),
                  type: (body.type ?? 'unknown').toLowerCase(),
                  status: body.status ?? null,
                  star_type: null,
                  system_code: systemCode,
                  system_name: sys.name ?? null,
                  parent_id: body.parent_id ? String(body.parent_id) : rsiId,
                  faction_name: body.affiliation?.[0]?.name ?? null,
                  affiliations: json((body.affiliation ?? []).map((a: any) => a.name).filter(Boolean)),
                  thumbnail: body.thumbnail?.url ?? null,
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
}
