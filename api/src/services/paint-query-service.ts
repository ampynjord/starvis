/**
 * PaintQueryService — Global listing of ship paints/liveries
 */
import type { PrismaLike as PrismaClient } from '@starvis/db';
import type { FiltersResult, PaginatedResult, Row } from './shared.js';
import { toPostgres } from './shared.js';

function paintMarketAggregateSelect(): string {
  return `
      paint_market.min_purchase_price,
      paint_market.min_rental_price_1d,
      paint_market.min_rental_price_3d,
      paint_market.min_rental_price_7d,
      paint_market.min_rental_price_30d,
      COALESCE(paint_market.purchase_location_count, 0)::integer as purchase_location_count,
      COALESCE(paint_market.rental_location_count, 0)::integer as rental_location_count`;
}

const PAINT_MARKET_JOIN = `LEFT JOIN (
  SELECT
    shop.env,
    LOWER(si.component_class_name) as component_class_key,
    MIN(si.base_price) FILTER (WHERE si.base_price > 0) as min_purchase_price,
    MIN(si.rental_price_1d) FILTER (WHERE si.rental_price_1d > 0) as min_rental_price_1d,
    MIN(si.rental_price_3d) FILTER (WHERE si.rental_price_3d > 0) as min_rental_price_3d,
    MIN(si.rental_price_7d) FILTER (WHERE si.rental_price_7d > 0) as min_rental_price_7d,
    MIN(si.rental_price_30d) FILTER (WHERE si.rental_price_30d > 0) as min_rental_price_30d,
    COUNT(DISTINCT si.shop_id) FILTER (WHERE si.base_price > 0) as purchase_location_count,
    COUNT(DISTINCT si.shop_id) FILTER (WHERE si.rental_price_1d > 0 OR si.rental_price_3d > 0 OR si.rental_price_7d > 0 OR si.rental_price_30d > 0) as rental_location_count
  FROM game.shop_inventory si
  JOIN game.shops shop ON shop.id = si.shop_id
  WHERE si.inventory_kind IN ('component', 'item', 'unknown')
  GROUP BY shop.env, LOWER(si.component_class_name)
) paint_market ON paint_market.env = sp.env
  AND paint_market.component_class_key = LOWER(sp.paint_class_name)`;

export class PaintQueryService {
  constructor(private getClient: (env: string) => PrismaClient) {}

  async getAllPaints(opts: { env?: string; search?: string; ship_uuid?: string; page?: number; limit?: number }): Promise<PaginatedResult> {
    const env = opts.env ?? 'live';
    const prisma = this.getClient(env);
    const where: string[] = ['sp.env = ?'];
    const params: (string | number)[] = [env];

    if (opts.search) {
      where.push('(sp.paint_name ILIKE ? OR sp.paint_class_name ILIKE ? OR s.name ILIKE ?)');
      const t = `%${opts.search}%`;
      params.push(t, t, t);
    }
    if (opts.ship_uuid) {
      where.push('sp.ship_uuid = ?');
      params.push(opts.ship_uuid);
    }

    const w = ` WHERE ${where.join(' AND ')}`;
    const baseSql = `SELECT sp.id, sp.ship_uuid, sp.paint_class_name, sp.paint_name, sp.paint_uuid,
      s.name as ship_name, s.class_name as ship_class_name,
      m.name as manufacturer_name, m.code as manufacturer_code,
      ${paintMarketAggregateSelect()}
      FROM game.ship_paints sp
      LEFT JOIN game.ships s ON sp.ship_uuid = s.uuid AND s.env = sp.env
      LEFT JOIN game.manufacturers m ON s.manufacturer_code = m.code
      ${PAINT_MARKET_JOIN}${w}`;
    const countSql = `SELECT COUNT(*) as total FROM game.ship_paints sp LEFT JOIN game.ships s ON sp.ship_uuid = s.uuid AND s.env = sp.env${w}`;

    const countRows = await prisma.$queryRawUnsafe<Row[]>(toPostgres(countSql), ...params);
    const total = Number(countRows[0]?.total) || 0;

    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(5000, Math.max(1, opts.limit || 50));
    const offset = (page - 1) * limit;

    const sql = `${baseSql} ORDER BY s.name, sp.paint_name LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
    const rows = await prisma.$queryRawUnsafe<Row[]>(toPostgres(sql), ...params);
    return { data: rows, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getPaintFilters(env = 'live'): Promise<FiltersResult> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT s.uuid as value, COALESCE(sm.name, s.name) as label, COUNT(sp.id) as count
       FROM game.ship_paints sp
       JOIN game.ships s ON sp.ship_uuid = s.uuid AND s.env = sp.env
       LEFT JOIN rsi.ship_matrix sm ON s.ship_matrix_id = sm.id
       WHERE sp.env = ?
       GROUP BY s.uuid, s.name, sm.name
       ORDER BY COALESCE(sm.name, s.name)`),
      env,
    );
    return {
      filters: {
        ship: rows.map((r) => ({ value: String(r.value), label: String(r.label), count: Number(r.count) })),
      },
    };
  }

  async getPaintGroups(opts: { env?: string; search?: string; manufacturer?: string }): Promise<{
    groups: Row[];
    total: number;
    manufacturerOptions: Row[];
  }> {
    const env = opts.env ?? 'live';
    const prisma = this.getClient(env);
    const where: string[] = ['sp.env = ?'];
    const params: (string | number)[] = [env];

    if (opts.search) {
      where.push('(sp.paint_name ILIKE ? OR sp.paint_class_name ILIKE ? OR s.name ILIKE ?)');
      const t = `%${opts.search}%`;
      params.push(t, t, t);
    }
    if (opts.manufacturer) {
      where.push('COALESCE(m.name, ?) = ?');
      params.push('-', opts.manufacturer);
    }

    const whereClause = where.join(' AND ');
    const baseFrom = `FROM game.ship_paints sp
      LEFT JOIN game.ships s ON sp.ship_uuid = s.uuid AND s.env = sp.env
      LEFT JOIN game.manufacturers m ON s.manufacturer_code = m.code
      ${PAINT_MARKET_JOIN}
      WHERE ${whereClause}`;

    const [groups, totalRows, manufacturerRows] = await Promise.all([
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT
          manufacturer_name,
          jsonb_agg(
            jsonb_build_object(
              'shipName', ship_name,
              'shipUuid', ship_uuid,
              'paintCount', paint_count,
              'paints', paints
            )
            ORDER BY ship_name
          ) as ships,
          SUM(paint_count)::int as paint_count,
          COUNT(*)::int as ship_count
         FROM (
          SELECT
            COALESCE(m.name, '-') as manufacturer_name,
            COALESCE(s.name, '-') as ship_name,
            COALESCE(sp.ship_uuid, '') as ship_uuid,
            COUNT(sp.id)::int as paint_count,
            jsonb_agg(
              jsonb_build_object(
                'id', sp.id,
                'ship_uuid', sp.ship_uuid,
                'paint_class_name', sp.paint_class_name,
                'paint_name', sp.paint_name,
                'paint_uuid', sp.paint_uuid,
                'ship_name', s.name,
                'ship_class_name', s.class_name,
                'manufacturer_name', m.name,
                'manufacturer_code', m.code,
                'min_purchase_price', paint_market.min_purchase_price,
                'min_rental_price_1d', paint_market.min_rental_price_1d,
                'min_rental_price_3d', paint_market.min_rental_price_3d,
                'min_rental_price_7d', paint_market.min_rental_price_7d,
                'min_rental_price_30d', paint_market.min_rental_price_30d,
                'purchase_location_count', COALESCE(paint_market.purchase_location_count, 0),
                'rental_location_count', COALESCE(paint_market.rental_location_count, 0)
              )
              ORDER BY sp.paint_name
            ) as paints
           ${baseFrom}
           GROUP BY COALESCE(m.name, '-'), COALESCE(s.name, '-'), COALESCE(sp.ship_uuid, '')
         ) grouped_ships
         GROUP BY manufacturer_name
         ORDER BY manufacturer_name`),
        ...params,
      ),
      prisma.$queryRawUnsafe<Row[]>(toPostgres(`SELECT COUNT(*) as total ${baseFrom}`), ...params),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT COALESCE(m.name, '-') as value, COALESCE(m.name, '-') as label, COUNT(sp.id)::int as count
         FROM game.ship_paints sp
         LEFT JOIN game.ships s ON sp.ship_uuid = s.uuid AND s.env = sp.env
         LEFT JOIN game.manufacturers m ON s.manufacturer_code = m.code
         WHERE sp.env = ?
         GROUP BY COALESCE(m.name, '-')
         ORDER BY COALESCE(m.name, '-')`),
        env,
      ),
    ]);

    return {
      groups,
      total: Number(totalRows[0]?.total ?? 0),
      manufacturerOptions: manufacturerRows.map((row) => ({
        value: String(row.value),
        label: String(row.label),
        count: Number(row.count),
      })),
    };
  }
}
