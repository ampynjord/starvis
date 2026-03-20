/**
 * CommodityQueryService — Tradeable/mineable goods (metals, minerals, gas, food, etc.)
 */
import type { PrismaClient } from '@prisma/client';
import { type PaginatedResult, paginate, type Row } from './shared.js';

const COMMODITY_SORT = new Set(['name', 'class_name', 'type', 'sub_type', 'symbol', 'occupancy_scu']);

export class CommodityQueryService {
  constructor(private prisma: PrismaClient) {}

  async getAllCommodities(filters?: {
    env?: string;
    type?: string;
    search?: string;
    sort?: string;
    order?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult> {
    const env = filters?.env ?? 'live';
    const where: string[] = ['c.game_env = ?'];
    const params: (string | number)[] = [env];

    if (filters?.type) {
      where.push('c.type = ?');
      params.push(filters.type);
    }
    if (filters?.search) {
      where.push('(c.name LIKE ? OR c.class_name LIKE ?)');
      const t = `%${filters.search}%`;
      params.push(t, t);
    }

    const w = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const baseSql = `SELECT c.* FROM commodities c${w}`;
    const countSql = `SELECT COUNT(*) as total FROM commodities c${w}`;

    return paginate(this.prisma, baseSql, countSql, params, filters || {}, COMMODITY_SORT, 'c');
  }

  async getCommodityByUuid(uuid: string, env = 'live'): Promise<Row | null> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>('SELECT * FROM commodities WHERE uuid = ? AND game_env = ?', uuid, env);
    return rows[0] || null;
  }

  async getCommodityTypes(env = 'live'): Promise<{ types: { type: string; count: number }[] }> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      'SELECT type, COUNT(*) as count FROM commodities WHERE game_env = ? GROUP BY type ORDER BY count DESC',
      env,
    );
    return { types: rows.map((r) => ({ type: String(r.type), count: Number(r.count) })) };
  }
}
