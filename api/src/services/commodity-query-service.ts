/**
 * CommodityQueryService — Tradeable/mineable goods (metals, minerals, gas, food, etc.)
 */
import type { Pool } from 'mysql2/promise';
import { type PaginatedResult, paginate, type Row } from './shared.js';

const COMMODITY_SORT = new Set(['name', 'class_name', 'type', 'sub_type', 'symbol', 'occupancy_scu']);

export class CommodityQueryService {
  constructor(private pool: Pool) {}

  async getAllCommodities(filters?: {
    type?: string;
    search?: string;
    sort?: string;
    order?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult> {
    const where: string[] = [];
    const params: (string | number)[] = [];

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

    return paginate(this.pool, baseSql, countSql, params, filters || {}, COMMODITY_SORT, 'c');
  }

  async getCommodityByUuid(uuid: string): Promise<Row | null> {
    const [rows] = await this.pool.execute<Row[]>('SELECT * FROM commodities WHERE uuid = ?', [uuid]);
    return rows[0] || null;
  }

  async getCommodityTypes(): Promise<{ types: { type: string; count: number }[] }> {
    const [rows] = await this.pool.execute<Row[]>('SELECT type, COUNT(*) as count FROM commodities GROUP BY type ORDER BY count DESC');
    return { types: rows.map((r) => ({ type: String(r.type), count: Number(r.count) })) };
  }
}
