/**
 * ShopService — Shop & inventory queries
 */
import type { PrismaClient } from '@prisma/client';
import type { PaginatedResult, Row } from './shared.js';

export class ShopService {
  constructor(private prisma: PrismaClient) {}

  async getShops(opts: {
    env?: string;
    page?: number;
    limit?: number;
    location?: string;
    type?: string;
    search?: string;
  }): Promise<PaginatedResult> {
    const env = opts.env ?? 'live';
    const where: string[] = ['game_env = ?'];
    const params: (string | number)[] = [env];

    if (opts.search) {
      where.push('(name LIKE ? OR location LIKE ? OR planet_moon LIKE ? OR city LIKE ?)');
      const t = `%${opts.search}%`;
      params.push(t, t, t, t);
    }
    if (opts.location) {
      where.push('(location LIKE ? OR planet_moon LIKE ? OR city LIKE ?)');
      const t = `%${opts.location}%`;
      params.push(t, t, t);
    }
    if (opts.type) {
      where.push('shop_type = ?');
      params.push(opts.type);
    }

    const w = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(100, Math.max(1, opts.limit || 20));
    const offset = (page - 1) * limit;

    const countRows = await this.prisma.$queryRawUnsafe<Row[]>(`SELECT COUNT(*) as count FROM shops${w}`, ...params);
    const total = Number(countRows[0].count);
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT * FROM shops${w} ORDER BY name LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      ...params,
    );

    return { data: rows, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getShopInventory(shopId: number, env = 'live'): Promise<Row[]> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT si.*, c.name as component_name, c.type as component_type, c.size as component_size,
              s.source_type as shop_source_type, s.source_name as shop_source_name,
              s.canonical_shop_key, s.canonical_location_key
       FROM shop_inventory si LEFT JOIN components c ON si.component_uuid = c.uuid AND c.game_env = si.game_env
       JOIN shops s ON si.shop_id = s.id
       WHERE si.shop_id = ? AND si.game_env = ? ORDER BY c.type, c.name`,
      shopId,
      env,
    );
    return rows;
  }
}
