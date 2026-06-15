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
    inventory_count: row.inventory_count == null ? undefined : Number(row.inventory_count),
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
    shop_type?: string;
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
    const shopType = opts.type ?? opts.shop_type;
    if (shopType) {
      where.push('shop_type = ?');
      params.push(shopType);
    }

    const w = ` WHERE ${where.join(' AND ')}`;
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(100, Math.max(1, opts.limit || 20));
    const offset = (page - 1) * limit;

    const countRows = await prisma.$queryRawUnsafe<Row[]>(toPostgres(`SELECT COUNT(*) as count FROM game.shops${w}`), ...params);
    const total = Number(countRows[0].count);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT id, name, class_name, shop_type, location_uuid, location, planet_moon, city, system,
              canonical_shop_key, canonical_location_key AS loc_key,
              franchise_slug, location_slug, franchise_loc_key, p4k_path,
              (SELECT COUNT(*) FROM game.shop_inventory si WHERE si.shop_id = s.id) as inventory_count
       FROM game.shops s${w} ORDER BY name LIMIT ${Number(limit)} OFFSET ${Number(offset)}`),
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

  async getShopById(shopId: number, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT id, name, class_name, shop_type, location_uuid, location, planet_moon, city, system,
              canonical_shop_key, canonical_location_key AS loc_key,
              franchise_slug, location_slug, franchise_loc_key, p4k_path,
              (SELECT COUNT(*) FROM game.shop_inventory si WHERE si.shop_id = s.id) as inventory_count
       FROM game.shops s WHERE env = ? AND id = ? LIMIT 1`),
      env,
      shopId,
    );
    return rows[0] ? normalizeShopRow(rows[0]) : null;
  }

  async getShopsByLocation(locationUuid: string, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT id, name, class_name, shop_type, location_uuid, location, planet_moon, city, system,
              canonical_shop_key, canonical_location_key AS loc_key,
              franchise_slug, location_slug, franchise_loc_key, p4k_path,
              (SELECT COUNT(*) FROM game.shop_inventory si WHERE si.shop_id = s.id) as inventory_count
       FROM game.shops s
       WHERE s.env = ?
         AND (
           s.location_uuid = ?
           OR s.canonical_location_key = (
             SELECT loc_key FROM game.locations WHERE env = ? AND uuid = ? LIMIT 1
           )
         )
       ORDER BY shop_type, name`),
      env,
      locationUuid,
      env,
      locationUuid,
    );
    return rows.map(normalizeShopRow);
  }

  async getShopInventory(shopId: number, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT si.*,
              COALESCE(c.name, i.name, sh.name, co.name, si.component_class_name) as item_name,
              COALESCE(c.class_name, i.class_name, sh.class_name, co.class_name, si.component_class_name) as item_class_name,
              COALESCE(c.type, i.type, sh.vehicle_category, co.type, si.inventory_kind) as item_type,
              COALESCE(c.size, i.size) as item_size,
              COALESCE(c.name, i.name, sh.name, co.name, si.component_class_name) as component_name,
              COALESCE(c.type, i.type, sh.vehicle_category, co.type, si.inventory_kind) as component_type,
              COALESCE(c.size, i.size) as component_size,
              CASE
                WHEN si.inventory_kind IS NOT NULL AND si.inventory_kind != 'unknown' THEN si.inventory_kind
                WHEN c.uuid IS NOT NULL THEN 'component'
                WHEN i.uuid IS NOT NULL THEN 'item'
                WHEN sh.uuid IS NOT NULL THEN 'ship'
                WHEN co.uuid IS NOT NULL THEN 'commodity'
                ELSE 'unknown'
              END as inventory_kind
       FROM game.shop_inventory si
       JOIN game.shops s ON s.id = si.shop_id
       LEFT JOIN game.components c ON si.component_uuid = c.uuid AND c.env = s.env
       LEFT JOIN game.items i ON si.component_uuid = i.uuid AND i.env = s.env
       LEFT JOIN game.ships sh ON si.component_uuid = sh.uuid AND sh.env = s.env
       LEFT JOIN game.commodities co ON si.component_uuid = co.uuid AND co.env = s.env
       WHERE s.env = ? AND si.shop_id = ? ORDER BY si.inventory_kind, COALESCE(c.type, i.type, sh.vehicle_category, co.type), COALESCE(c.name, i.name, sh.name, co.name, si.component_class_name)`),
      env,
      shopId,
    );
    return rows;
  }
}
