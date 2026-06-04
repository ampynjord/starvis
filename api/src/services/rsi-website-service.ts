/**
 * RsiWebsiteService — Queries the rsi schema (RSI website + SC Wiki scraped data).
 *
 * Contains data scraped from the RSI website and SC Wiki API:
 *   - galactapedia     (lore encyclopedia)
 *   - starmap_locations (RSI web starmap, distinct from in-game)
 *   - comm_links       (RSI communications / news)
 */
import type { PrismaLike as PrismaClient } from '@starvis/db';
import type { PaginatedResult, Row } from './shared.js';
import { toPostgres } from './shared.js';

export class RsiWebsiteService {
  constructor(private prisma: PrismaClient) {}

  // ── Galactapedia ───────────────────────────────────────────────────────────

  async getGalactapediaEntries(opts: { search?: string; category?: string; page?: number; limit?: number } = {}): Promise<PaginatedResult> {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (opts.search) {
      where.push('(g.title ILIKE ? OR g.excerpt ILIKE ?)');
      const t = `%${opts.search}%`;
      params.push(t, t);
    }
    if (opts.category) {
      // PostgreSQL jsonb containment: check if categories array contains the value
      where.push('g.categories::jsonb @> jsonb_build_array(?::text)');
      params.push(opts.category);
    }

    const w = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(100, Math.max(1, opts.limit || 20));
    const offset = (page - 1) * limit;

    const countRows = await this.prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT COUNT(*) as total FROM rsi.galactapedia g${w}`),
      ...params,
    );
    const total = Number(countRows[0]?.total) || 0;

    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT g.id, g.slug, g.title, g.excerpt, g.type, g.template,
              g.categories, g.tags, g.categories_count, g.tags_count, g.related_articles_count,
              g.thumbnail_url, g.rsi_url, g.api_url, g.web_url, g.source_created_at, g.updated_at
       FROM rsi.galactapedia g${w} ORDER BY g.title LIMIT ${limit} OFFSET ${offset}`),
      ...params,
    );
    return { data: rows, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getGalactapediaEntry(id: string): Promise<Row | null> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT * FROM rsi.galactapedia WHERE id = ? OR slug = ? LIMIT 1`),
      id,
      id,
    );
    return rows[0] ?? null;
  }

  // ── Comm-links ─────────────────────────────────────────────────────────────

  async getCommLinks(opts: { search?: string; category?: string; page?: number; limit?: number } = {}): Promise<PaginatedResult> {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (opts.search) {
      where.push('(cl.title ILIKE ? OR cl.excerpt ILIKE ?)');
      const t = `%${opts.search}%`;
      params.push(t, t);
    }
    if (opts.category) {
      where.push('cl.category = ?');
      params.push(opts.category);
    }

    const w = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(100, Math.max(1, opts.limit || 20));
    const offset = (page - 1) * limit;

    const countRows = await this.prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT COUNT(*) as total FROM rsi.comm_links cl${w}`),
      ...params,
    );
    const total = Number(countRows[0]?.total) || 0;

    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT cl.id, cl.rsi_id, cl.slug, cl.title, cl.excerpt, cl.category,
              cl.source_category, cl.channel, cl.series, cl.thumbnail_url, cl.rsi_url,
              cl.api_url, cl.api_public_url, cl.images_count, cl.links_count, cl.comment_count,
              cl.published_at
       FROM rsi.comm_links cl${w} ORDER BY cl.published_at DESC LIMIT ${limit} OFFSET ${offset}`),
      ...params,
    );
    return { data: rows, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getCommLink(id: string): Promise<Row | null> {
    const isNumeric = /^\d+$/.test(id);
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      isNumeric
        ? toPostgres(`SELECT * FROM rsi.comm_links WHERE id = ? LIMIT 1`)
        : toPostgres(`SELECT * FROM rsi.comm_links WHERE slug = ? OR rsi_id = ? LIMIT 1`),
      ...(isNumeric ? [parseInt(id, 10)] : [id, id]),
    );
    return rows[0] ?? null;
  }

  async getCommLinkCategories(): Promise<string[]> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT DISTINCT category FROM rsi.comm_links WHERE category IS NOT NULL ORDER BY category`,
    );
    return rows.map((r) => String(r.category));
  }

  async getCommLinkImages(opts: { search?: string; page?: number; limit?: number } = {}): Promise<PaginatedResult> {
    const where: string[] = ['cl.thumbnail_url IS NOT NULL', "cl.thumbnail_url != ''"];
    const params: (string | number)[] = [];
    if (opts.search) {
      where.push('(cl.title ILIKE ? OR cl.category ILIKE ? OR cl.series ILIKE ?)');
      const q = `%${opts.search}%`;
      params.push(q, q, q);
    }
    const w = ` WHERE ${where.join(' AND ')}`;
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(100, Math.max(1, opts.limit || 20));
    const offset = (page - 1) * limit;
    const countRows = await this.prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT COUNT(*) as total FROM rsi.comm_links cl${w}`),
      ...params,
    );
    const total = Number(countRows[0]?.total) || 0;
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT cl.id, cl.rsi_id, cl.slug, cl.title, cl.category, cl.channel, cl.series,
              cl.thumbnail_url as url, cl.thumbnail_url, cl.rsi_url, cl.api_url, cl.api_public_url,
              cl.images_count, cl.published_at
       FROM rsi.comm_links cl${w}
       ORDER BY cl.published_at DESC NULLS LAST, cl.id DESC
       LIMIT ${limit} OFFSET ${offset}`),
      ...params,
    );
    return { data: rows, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getRandomCommLinkImage(): Promise<Row | null> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT cl.id, cl.rsi_id, cl.slug, cl.title, cl.category, cl.channel, cl.series,
              cl.thumbnail_url as url, cl.thumbnail_url, cl.rsi_url, cl.api_url, cl.api_public_url,
              cl.images_count, cl.published_at
       FROM rsi.comm_links cl
       WHERE cl.thumbnail_url IS NOT NULL AND cl.thumbnail_url != ''
       ORDER BY RANDOM()
       LIMIT 1`,
    );
    return rows[0] ?? null;
  }

  async getCommLinkImage(id: string): Promise<Row | null> {
    const isNumeric = /^\d+$/.test(id);
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT cl.id, cl.rsi_id, cl.slug, cl.title, cl.category, cl.channel, cl.series,
              cl.thumbnail_url as url, cl.thumbnail_url, cl.rsi_url, cl.api_url, cl.api_public_url,
              cl.images_count, cl.published_at
       FROM rsi.comm_links cl
       WHERE cl.thumbnail_url IS NOT NULL AND cl.thumbnail_url != ''
         AND ${isNumeric ? 'cl.id = ?' : '(cl.slug = ? OR cl.rsi_id = ?)'}
       LIMIT 1`),
      ...(isNumeric ? [Number(id)] : [id, id]),
    );
    return rows[0] ?? null;
  }

  // ── Starmap (RSI web version) ──────────────────────────────────────────────

  async getStarmapSystems(opts: { search?: string; page?: number; limit?: number } = {}): Promise<PaginatedResult> {
    const where: string[] = ["sl.type IN ('star', 'StarSystem')"];
    const params: (string | number)[] = [];

    if (opts.search) {
      where.push('(sl.name ILIKE ? OR sl.system_name ILIKE ?)');
      const t = `%${opts.search}%`;
      params.push(t, t);
    }

    const w = ` WHERE ${where.join(' AND ')}`;
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(100, Math.max(1, opts.limit || 20));
    const offset = (page - 1) * limit;

    const countRows = await this.prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT COUNT(*) as total FROM rsi.starmap_locations sl${w}`),
      ...params,
    );
    const total = Number(countRows[0]?.total) || 0;

    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT sl.id, sl.rsi_id, sl.name, sl.type, sl.status, sl.star_type,
              sl.system_code, sl.system_name, sl.faction_name, sl.affiliations,
              sl.thumbnail, sl.description, sl.web_url, sl.coordinates, sl.aggregated,
              sl.size, sl.population, sl.economy, sl.danger,
              sl.frost_line, sl.habitable_zone_inner, sl.habitable_zone_outer,
              sl.jump_points, sl.source_updated_at, sl.synced_at,
              (
                SELECT json_build_object(
                  'uuid', gl.uuid,
                  'env', gl.env,
                  'name', gl.name,
                  'type', gl.type,
                  'system_code', gl.system_code,
                  'coordinates', gl.coordinates,
                  'p4k_path', gl.p4k_path
                )
                FROM game.locations gl
                WHERE gl.rsi_starmap_location_id = sl.id
                ORDER BY CASE WHEN gl.type = 'system' THEN 0 ELSE 1 END, gl.name
                LIMIT 1
              ) as p4k_location
       FROM rsi.starmap_locations sl${w} ORDER BY sl.name LIMIT ${limit} OFFSET ${offset}`),
      ...params,
    );
    return { data: rows, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getStarmapLocations(
    opts: { search?: string; type?: string; system?: string; affiliation?: string; page?: number; limit?: number } = {},
  ): Promise<PaginatedResult> {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (opts.search) {
      where.push('(sl.name ILIKE ? OR sl.system_name ILIKE ? OR sl.description ILIKE ?)');
      const t = `%${opts.search}%`;
      params.push(t, t, t);
    }
    if (opts.type) {
      where.push('sl.type = ?');
      params.push(opts.type);
    }
    if (opts.system) {
      where.push('(sl.system_code = ? OR sl.system_name ILIKE ?)');
      params.push(opts.system.toUpperCase(), opts.system);
    }
    if (opts.affiliation) {
      where.push('sl.faction_name ILIKE ?');
      params.push(opts.affiliation);
    }

    const w = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(200, Math.max(1, opts.limit || 50));
    const offset = (page - 1) * limit;

    const countRows = await this.prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT COUNT(*) as total FROM rsi.starmap_locations sl${w}`),
      ...params,
    );
    const total = Number(countRows[0]?.total) || 0;

    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT sl.id, sl.rsi_id, sl.name, sl.type, sl.status, sl.star_type,
              sl.system_code, sl.system_name, sl.parent_id, sl.faction_name, sl.affiliations,
              sl.thumbnail, sl.description, sl.web_url, sl.coordinates, sl.aggregated,
              sl.size, sl.population, sl.economy, sl.danger,
              sl.frost_line, sl.habitable_zone_inner, sl.habitable_zone_outer,
              sl.jump_points, sl.source_updated_at, sl.synced_at,
              (
                SELECT json_build_object(
                  'uuid', gl.uuid,
                  'env', gl.env,
                  'name', gl.name,
                  'type', gl.type,
                  'system_code', gl.system_code,
                  'coordinates', gl.coordinates,
                  'p4k_path', gl.p4k_path
                )
                FROM game.locations gl
                WHERE gl.rsi_starmap_location_id = sl.id
                ORDER BY gl.name
                LIMIT 1
              ) as p4k_location
       FROM rsi.starmap_locations sl${w}
       ORDER BY COALESCE(sl.system_name, sl.name), sl.type, sl.name
       LIMIT ${limit} OFFSET ${offset}`),
      ...params,
    );
    return { data: rows, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getStarmapLocation(identifier: string): Promise<Row | null> {
    const isNumeric = /^\d+$/.test(identifier);
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT sl.*,
        (
          SELECT json_build_object(
            'uuid', gl.uuid,
            'env', gl.env,
            'name', gl.name,
            'type', gl.type,
            'system_code', gl.system_code,
            'coordinates', gl.coordinates,
            'p4k_path', gl.p4k_path
          )
          FROM game.locations gl
          WHERE gl.rsi_starmap_location_id = sl.id
          ORDER BY gl.name
          LIMIT 1
        ) as p4k_location,
        (SELECT json_agg(json_build_object(
          'id', c.id,
          'rsi_id', c.rsi_id,
          'name', c.name,
          'type', c.type,
          'coordinates', c.coordinates,
          'web_url', c.web_url
        ) ORDER BY c.type, c.name)
         FROM rsi.starmap_locations c
         WHERE c.parent_id = sl.rsi_id OR (sl.type = 'star' AND c.system_code = sl.system_code AND c.id != sl.id)
        ) as children
       FROM rsi.starmap_locations sl
       WHERE ${isNumeric ? 'sl.id = ? OR sl.rsi_id = ?' : 'sl.rsi_id = ? OR sl.system_code = ? OR LOWER(sl.name) = LOWER(?)'}
       LIMIT 1`),
      ...(isNumeric ? [Number(identifier), identifier] : [identifier, identifier.toUpperCase(), identifier]),
    );
    return rows[0] ?? null;
  }

  async getStarmapFilters(): Promise<{ filters: Record<string, Row[]> }> {
    const [types, systems, affiliations, statuses] = await Promise.all([
      this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT type as value, type as label, COUNT(*) as count FROM rsi.starmap_locations GROUP BY type ORDER BY type`,
      ),
      this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT system_code as value, COALESCE(system_name, system_code) as label, COUNT(*) as count
         FROM rsi.starmap_locations WHERE system_code IS NOT NULL GROUP BY system_code, system_name ORDER BY label`,
      ),
      this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT faction_name as value, faction_name as label, COUNT(*) as count
         FROM rsi.starmap_locations WHERE faction_name IS NOT NULL AND faction_name != ''
         GROUP BY faction_name ORDER BY faction_name`,
      ),
      this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT status as value, status as label, COUNT(*) as count
         FROM rsi.starmap_locations WHERE status IS NOT NULL AND status != ''
         GROUP BY status ORDER BY status`,
      ),
    ]);
    return { filters: { type: types, system: systems, affiliation: affiliations, status: statuses } };
  }

  async getStarmapPositions(): Promise<Row[]> {
    return this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT sl.id, sl.rsi_id, sl.name, sl.type, sl.system_code, sl.system_name,
              sl.status, sl.faction_name, sl.parent_id, parent.id as parent_db_id,
              sl.coordinates, sl.aggregated,
              (
                SELECT json_build_object(
                  'uuid', gl.uuid,
                  'name', gl.name,
                  'type', gl.type,
                  'system_code', gl.system_code,
                  'parent_uuid', gl.parent_uuid,
                  'coordinates', gl.coordinates,
                  'p4k_path', gl.p4k_path,
                  'is_scannable', gl.is_scannable
                )
                FROM game.locations gl
                WHERE gl.rsi_starmap_location_id = sl.id AND gl.env = 'live'
                ORDER BY CASE WHEN lower(gl.type) = lower(sl.type) THEN 0 ELSE 1 END, gl.name
                LIMIT 1
              ) as p4k_location
       FROM rsi.starmap_locations sl
       LEFT JOIN rsi.starmap_locations parent ON parent.rsi_id = sl.parent_id
       ORDER BY COALESCE(sl.system_name, sl.name), sl.type, sl.name`,
    );
  }

  async getJumpPoints(): Promise<Row[]> {
    return this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT id, rsi_id, name, system_code, system_name, jump_points, web_url
       FROM rsi.starmap_locations
       WHERE jump_points IS NOT NULL
       ORDER BY system_name, name`,
    );
  }

  async getStarmapSystem(codeOrId: string): Promise<Row | null> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT sl.*,
        (
          SELECT json_build_object(
            'uuid', gl.uuid,
            'env', gl.env,
            'name', gl.name,
            'type', gl.type,
            'system_code', gl.system_code,
            'coordinates', gl.coordinates,
            'p4k_path', gl.p4k_path
          )
          FROM game.locations gl
          WHERE gl.rsi_starmap_location_id = sl.id
          ORDER BY CASE WHEN gl.type = 'system' THEN 0 ELSE 1 END, gl.name
          LIMIT 1
        ) as p4k_location,
        (SELECT json_agg(json_build_object(
          'id', c.id,
          'name', c.name,
          'type', c.type,
          'rsi_id', c.rsi_id,
          'p4k_location', (
            SELECT json_build_object(
              'uuid', gl.uuid,
              'env', gl.env,
              'name', gl.name,
              'type', gl.type,
              'system_code', gl.system_code,
              'coordinates', gl.coordinates,
              'p4k_path', gl.p4k_path
            )
            FROM game.locations gl
            WHERE gl.rsi_starmap_location_id = c.id
            ORDER BY gl.name
            LIMIT 1
          )
        ))
         FROM rsi.starmap_locations c WHERE c.system_code = sl.system_code AND c.type != 'star'
        ) as children
       FROM rsi.starmap_locations sl
       WHERE (sl.system_code = ? OR sl.rsi_id = ?) AND sl.type = 'star'
       LIMIT 1`),
      codeOrId.toUpperCase(),
      codeOrId,
    );
    return rows[0] ?? null;
  }
}
