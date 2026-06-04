/**
 * ShopService — Shop & inventory queries
 */
import type { PrismaLike as PrismaClient } from '@starvis/db';
import { formatEnumLabel } from '../normalizers/labels.js';
import { type FiltersResult, type PaginatedResult, type Row, toPostgres } from './shared.js';

function normalizeShopRow(row: Row): Row {
  return {
    ...row,
    display_shop_type: formatEnumLabel(String(row.shop_type ?? '')),
  };
}

export class ShopService {
  constructor(private getClient: (env: string) => PrismaClient) {}

  async getShops(opts: {
    env?: string;
    page?: number;
    limit?: number;
    location?: string;
    type?: string;
    search?: string;
  }): Promise<PaginatedResult> {
    const env = opts.env ?? 'live';
    const prisma = this.getClient(env);
    const where: string[] = ['env = ?'];
    const params: (string | number)[] = [env];

    if (opts.search) {
      where.push('(name ILIKE ? OR location ILIKE ? OR planet_moon ILIKE ? OR city ILIKE ?)');
      const t = `%${opts.search}%`;
      params.push(t, t, t, t);
    }
    if (opts.location) {
      where.push('(location ILIKE ? OR planet_moon ILIKE ? OR city ILIKE ?)');
      const t = `%${opts.location}%`;
      params.push(t, t, t);
    }
    if (opts.type) {
      where.push('shop_type = ?');
      params.push(opts.type);
    }

    const w = ` WHERE ${where.join(' AND ')}`;
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(100, Math.max(1, opts.limit || 20));
    const offset = (page - 1) * limit;

    const countRows = await prisma.$queryRawUnsafe<Row[]>(toPostgres(`SELECT COUNT(*) as count FROM game.shops${w}`), ...params);
    const total = Number(countRows[0].count);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT id, name, class_name, shop_type, location, planet_moon, city, system,
              canonical_shop_key, canonical_location_key AS loc_key,
              franchise_slug, location_slug, franchise_loc_key, p4k_path
       FROM game.shops${w} ORDER BY name LIMIT ${Number(limit)} OFFSET ${Number(offset)}`),
      ...params,
    );

    return { data: rows.map(normalizeShopRow), total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getShopFilters(env = 'live'): Promise<FiltersResult> {
    const prisma = this.getClient(env);
    const [typeRows, locationRows] = await Promise.all([
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT shop_type as value, COUNT(*) as count FROM game.shops WHERE env = ? GROUP BY shop_type ORDER BY shop_type`),
        env,
      ),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT DISTINCT system as value FROM game.shops WHERE env = ? AND system IS NOT NULL ORDER BY system`),
        env,
      ),
    ]);
    return {
      filters: {
        shop_type: typeRows.map((r) => ({ value: String(r.value), label: formatEnumLabel(String(r.value)), count: Number(r.count) })),
        system: locationRows.map((r) => ({ value: String(r.value), label: String(r.value) })),
      },
    };
  }

  async getShopInventory(shopId: number, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT si.*, c.name as component_name, c.type as component_type, c.size as component_size
       FROM game.shop_inventory si
       JOIN game.shops s ON s.id = si.shop_id
       LEFT JOIN game.components c ON si.component_uuid = c.uuid AND c.env = s.env
       WHERE s.env = ? AND si.shop_id = ? ORDER BY c.type, c.name`),
      env,
      shopId,
    );
    return rows;
  }
}
