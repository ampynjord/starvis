/**
 * PaintQueryService — Global listing of ship paints/liveries
 */
import type { PrismaLike as PrismaClient } from '@starvis/db';
import type { FiltersResult, PaginatedResult, Row } from './shared.js';
import { toPostgres } from './shared.js';

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
      m.name as manufacturer_name, m.code as manufacturer_code
      FROM game.ship_paints sp
      LEFT JOIN game.ships s ON sp.ship_uuid = s.uuid AND s.env = sp.env
      LEFT JOIN game.manufacturers m ON s.manufacturer_code = m.code${w}`;
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
}
