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

  // ── Starmap (RSI web version) ──────────────────────────────────────────────

  async getStarmapSystems(opts: { search?: string; page?: number; limit?: number } = {}): Promise<PaginatedResult> {
    const where: string[] = ["sl.type = 'star'"];
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
              sl.jump_points, sl.source_updated_at, sl.synced_at
       FROM rsi.starmap_locations sl${w} ORDER BY sl.name LIMIT ${limit} OFFSET ${offset}`),
      ...params,
    );
    return { data: rows, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getStarmapSystem(codeOrId: string): Promise<Row | null> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT sl.*,
        (SELECT json_agg(json_build_object('id', c.id, 'name', c.name, 'type', c.type, 'rsi_id', c.rsi_id))
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
