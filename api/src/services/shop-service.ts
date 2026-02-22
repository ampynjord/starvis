/**
 * ShopService — Shop & inventory queries
 */
import type { Pool } from 'mysql2/promise';
import type { PaginatedResult, Row } from './shared.js';

export class ShopService {
  constructor(private pool: Pool) {}

  async getShops(opts: { page?: number; limit?: number; location?: string; type?: string; search?: string }): Promise<PaginatedResult> {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (opts.search) {
      where.push('(name LIKE ? OR location LIKE ? OR parent_location LIKE ?)');
      const t = `%${opts.search}%`;
      params.push(t, t, t);
    }
    if (opts.location) {
      where.push('(location LIKE ? OR parent_location LIKE ?)');
      const t = `%${opts.location}%`;
      params.push(t, t);
    }
    if (opts.type) {
      where.push('shop_type = ?');
      params.push(opts.type);
    }

    const w = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(100, Math.max(1, opts.limit || 20));
    const offset = (page - 1) * limit;

    const [countRows] = await this.pool.execute<Row[]>(`SELECT COUNT(*) as count FROM shops${w}`, params);
    const total = Number(countRows[0].count);
    const [rows] = await this.pool.execute<Row[]>(
      `SELECT * FROM shops${w} ORDER BY name LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      params,
    );

    return { data: rows, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getShopInventory(shopId: number): Promise<Row[]> {
    const [rows] = await this.pool.execute<Row[]>(
      `SELECT si.*, c.name as component_name, c.type as component_type, c.size as component_size
       FROM shop_inventory si LEFT JOIN components c ON si.component_uuid = c.uuid
       WHERE si.shop_id = ? ORDER BY c.type, c.name`,
      [shopId],
    );
    return rows;
  }
}
