/**
 * CommodityQueryService — Tradeable/mineable goods (metals, minerals, gas, food, etc.)
 */
import type { PrismaLike as PrismaClient } from '@starvis/db';
import { type FiltersResult, type PaginatedResult, paginate, type Row, stripInternal, toPostgres } from './shared.js';

const COMMODITY_SORT = new Set(['name', 'class_name', 'type', 'sub_type', 'symbol', 'occupancy_scu']);

export class CommodityQueryService {
  constructor(private getClient: (env: string) => PrismaClient) {}

  async getAllCommodities(filters?: {
    env?: string;
    type?: string;
    types?: string;
    search?: string;
    sort?: string;
    order?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult> {
    const env = filters?.env ?? 'live';
    const prisma = this.getClient(env);
    const where: string[] = ['c.env = ?'];
    const params: (string | number)[] = [env];

    if (filters?.types) {
      const typeList = filters.types
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (typeList.length === 1) {
        where.push('c.type = ?');
        params.push(typeList[0]);
      } else if (typeList.length > 1) {
        where.push(`c.type IN (${typeList.map(() => '?').join(', ')})`);
        params.push(...typeList);
      }
    } else if (filters?.type) {
      where.push('c.type = ?');
      params.push(filters.type);
    }
    if (filters?.search) {
      where.push('(c.name ILIKE ? OR c.class_name ILIKE ?)');
      const t = `%${filters.search}%`;
      params.push(t, t);
    }

    const w = ` WHERE ${where.join(' AND ')}`;
    const baseSql = `SELECT c.* FROM game.commodities c${w}`;
    const countSql = `SELECT COUNT(*) as total FROM game.commodities c${w}`;

    return paginate(prisma, baseSql, countSql, params, filters || {}, COMMODITY_SORT, 'c');
  }

  async getCommodityByUuid(uuid: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT * FROM game.commodities WHERE uuid = ? AND env = ?`),
      uuid,
      env,
    );
    return rows[0] ? stripInternal(rows[0]) : null;
  }

  async getCommodityTypes(env = 'live'): Promise<{ types: { type: string; count: number }[] }> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT type, COUNT(*) as count FROM game.commodities WHERE env = ? GROUP BY type ORDER BY count DESC`),
      env,
    );
    return { types: rows.map((r) => ({ type: String(r.type), count: Number(r.count) })) };
  }

  async getCommodityFilters(env = 'live'): Promise<FiltersResult> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT type as value, COUNT(*) as count FROM game.commodities WHERE env = ? GROUP BY type ORDER BY type`),
      env,
    );
    return {
      filters: {
        type: rows.map((r) => ({ value: String(r.value), label: String(r.value), count: Number(r.count) })),
      },
    };
  }
}
