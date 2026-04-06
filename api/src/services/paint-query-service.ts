/**
 * PaintQueryService — Global listing of ship paints/liveries
 */
import type { PrismaLike as PrismaClient } from '@starvis/db';
import type { FiltersResult, PaginatedResult, Row } from './shared.js';

export class PaintQueryService {
  constructor(private getClient: (env: string) => PrismaClient) {}

  async getAllPaints(opts: { env?: string; search?: string; ship_uuid?: string; page?: number; limit?: number }): Promise<PaginatedResult> {
    const env = opts.env ?? 'live';
    const prisma = this.getClient(env);
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (opts.search) {
      where.push('(sp.paint_name LIKE ? OR sp.paint_class_name LIKE ? OR s.name LIKE ?)');
      const t = `%${opts.search}%`;
      params.push(t, t, t);
    }
    if (opts.ship_uuid) {
      where.push('sp.ship_uuid = ?');
      params.push(opts.ship_uuid);
    }

    const w = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const baseSql = `SELECT sp.id, sp.ship_uuid, sp.paint_class_name, sp.paint_name, sp.paint_uuid,
      s.name as ship_name, s.class_name as ship_class_name,
      m.name as manufacturer_name, m.code as manufacturer_code
      FROM ship_paints sp
      LEFT JOIN ships s ON sp.ship_uuid = s.uuid
      LEFT JOIN starvis.manufacturers m ON s.manufacturer_code = m.code${w}`;
    const countSql = `SELECT COUNT(*) as total FROM ship_paints sp LEFT JOIN ships s ON sp.ship_uuid = s.uuid${w}`;

    const countRows = await prisma.$queryRawUnsafe<Row[]>(countSql, ...params);
    const total = Number(countRows[0]?.total) || 0;

    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(200, Math.max(1, opts.limit || 50));
    const offset = (page - 1) * limit;

    const sql = `${baseSql} ORDER BY s.name, sp.paint_name LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
    const rows = await prisma.$queryRawUnsafe<Row[]>(sql, ...params);
    return { data: rows, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getPaintFilters(env = 'live'): Promise<FiltersResult> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT s.uuid as value, COALESCE(sm.name, s.name) as label, COUNT(sp.id) as count
       FROM ship_paints sp
       JOIN ships s ON sp.ship_uuid = s.uuid
       LEFT JOIN rsi_website.ship_matrix sm ON s.ship_matrix_id = sm.id
       GROUP BY s.uuid, s.name, sm.name
       ORDER BY COALESCE(sm.name, s.name)`,
    );
    return {
      filters: {
        ship: rows.map((r) => ({ value: String(r.value), label: String(r.label), count: Number(r.count) })),
      },
    };
  }
}
