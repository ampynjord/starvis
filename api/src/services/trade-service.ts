/**
 * TradeService — Commodity pricing, location finder, and route calculator
 */
import type { PrismaLike as PrismaClient } from '@starvis/db';
import { convertBigIntToNumber, type Row, toPostgres } from './shared.js';

export interface TradeRoute {
  buyCommodity: string;
  buyShop: string;
  buyLocation: string;
  buySystem: string | null;
  buyPrice: number;
  sellShop: string;
  sellLocation: string;
  sellSystem: string | null;
  sellPrice: number;
  profitPerUnit: number;
  profitPerScu: number;
  totalProfit: number;
  totalInvestment: number;
  scu: number;
}

export class TradeService {
  constructor(private getClient: (env: string) => PrismaClient) {}

  async getTradeSystems(env = 'live'): Promise<string[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT DISTINCT s.system
       FROM game.shops s
       INNER JOIN game.commodity_prices cp ON cp.shop_id = s.id AND cp.commodity_env = s.env
       WHERE s.env = ? AND s.system IS NOT NULL AND s.system != ''
       ORDER BY s.system`),
      env,
    );
    return rows.map((r) => String(r.system));
  }

  async getTradeLocations(env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT DISTINCT s.id, s.name, s.location, s.system, s.planet_moon, s.city, s.shop_type
       FROM game.shops s
       INNER JOIN game.commodity_prices cp ON cp.shop_id = s.id AND cp.commodity_env = s.env
       WHERE s.env = ?
       ORDER BY s.system, s.city, s.name`),
      env,
    );
    return convertBigIntToNumber(rows);
  }

  async getCommodityPrices(commodityUuid: string, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT cp.id, cp.buy_price, cp.sell_price, cp.reported_at,
              s.id as shop_id, s.name as shop_name, s.system, s.planet_moon, s.city
       FROM game.commodity_prices cp
       INNER JOIN game.shops s ON s.id = cp.shop_id AND s.env = cp.commodity_env
       WHERE cp.commodity_env = ? AND cp.commodity_uuid = ?
       ORDER BY s.system, s.city`),
      env,
      commodityUuid,
    );
    return convertBigIntToNumber(rows);
  }

  async getLocationPrices(shopId: number, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT cp.id, cp.commodity_uuid, cp.buy_price, cp.sell_price, cp.reported_at,
              c.name as commodity_name, c.type as commodity_type, c.symbol, c.occupancy_scu
       FROM game.commodity_prices cp
       INNER JOIN game.commodities c ON c.uuid = cp.commodity_uuid AND c.env = cp.commodity_env
       WHERE cp.commodity_env = ? AND cp.shop_id = ?
       ORDER BY c.type, c.name`),
      env,
      shopId,
    );
    return convertBigIntToNumber(rows);
  }

  async reportPrice(params: {
    commodityUuid: string;
    shopId: number;
    buyPrice?: number | null;
    sellPrice?: number | null;
    env?: string;
  }): Promise<Row> {
    const { commodityUuid, shopId, buyPrice, sellPrice, env = 'live' } = params;
    const prisma = this.getClient(env);
    const [existing] = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT id FROM game.commodity_prices WHERE commodity_env = ? AND commodity_uuid = ? AND shop_id = ?`),
      env,
      commodityUuid,
      shopId,
    );

    if (existing) {
      const sets: string[] = [];
      const vals: (number | string)[] = [];
      if (buyPrice !== undefined) {
        sets.push('buy_price = ?');
        vals.push(buyPrice ?? 0);
      }
      if (sellPrice !== undefined) {
        sets.push('sell_price = ?');
        vals.push(sellPrice ?? 0);
      }
      sets.push('reported_at = NOW()');
      await prisma.$executeRawUnsafe(
        toPostgres(`UPDATE game.commodity_prices SET ${sets.join(', ')} WHERE commodity_env = ? AND id = ?`),
        ...vals,
        env,
        Number(existing.id),
      );
      return { id: existing.id, updated: true };
    }

    await prisma.$executeRawUnsafe(
      toPostgres(
        `INSERT INTO game.commodity_prices (commodity_env, commodity_uuid, shop_id, buy_price, sell_price) VALUES (?, ?, ?, ?, ?)`,
      ),
      env,
      commodityUuid,
      shopId,
      buyPrice ?? null,
      sellPrice ?? null,
    );
    return { inserted: true };
  }

  async findBestRoutes(opts: {
    scu: number;
    budget?: number;
    env?: string;
    limit?: number;
    commodity?: string;
    buySystem?: string;
    sellSystem?: string;
    sort?: 'totalProfit' | 'profitPerScu' | 'profitPerUnit';
  }): Promise<TradeRoute[]> {
    const { scu, budget, env = 'live', limit = 20, commodity, buySystem, sellSystem, sort = 'totalProfit' } = opts;
    const prisma = this.getClient(env);
    const safeLimit = Math.min(Math.max(1, limit), 100);

    const where: string[] = [
      'buy_cp.commodity_env = ?',
      'buy_cp.buy_price IS NOT NULL',
      'buy_cp.buy_price > 0',
      'sell_cp.sell_price > buy_cp.buy_price',
    ];
    const params: (string | number)[] = [env];

    if (commodity) {
      where.push('c.name ILIKE ?');
      params.push(`%${commodity}%`);
    }
    if (buySystem) {
      where.push('buy_s.system = ?');
      params.push(buySystem);
    }
    if (sellSystem) {
      where.push('sell_s.system = ?');
      params.push(sellSystem);
    }

    params.push(safeLimit * 3);

    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT
        c.name as commodity_name,
        c.occupancy_scu,
        buy_cp.buy_price,
        buy_s.name as buy_shop, buy_s.system as buy_system, buy_s.city as buy_city,
       sell_cp.sell_price,
       sell_s.name as sell_shop, sell_s.system as sell_system, sell_s.city as sell_city
       FROM game.commodity_prices buy_cp
       INNER JOIN game.commodities c ON c.uuid = buy_cp.commodity_uuid AND c.env = buy_cp.commodity_env
       INNER JOIN game.shops buy_s ON buy_s.id = buy_cp.shop_id AND buy_s.env = buy_cp.commodity_env
       INNER JOIN game.commodity_prices sell_cp ON sell_cp.commodity_uuid = buy_cp.commodity_uuid
         AND sell_cp.commodity_env = buy_cp.commodity_env
         AND sell_cp.shop_id != buy_cp.shop_id
         AND sell_cp.sell_price IS NOT NULL AND sell_cp.sell_price > 0
       INNER JOIN game.shops sell_s ON sell_s.id = sell_cp.shop_id AND sell_s.env = sell_cp.commodity_env
       WHERE ${where.join(' AND ')}
       ORDER BY (sell_cp.sell_price - buy_cp.buy_price) DESC
       LIMIT ?`),
      ...params,
    );

    const routes: TradeRoute[] = [];
    for (const r of convertBigIntToNumber(rows)) {
      const buyPrice = Number(r.buy_price);
      const sellPrice = Number(r.sell_price);
      const occupancy = Number(r.occupancy_scu) || 1;
      const units = Math.floor(scu / occupancy);
      if (units <= 0) continue;

      const totalCost = units * buyPrice;
      if (budget && totalCost > budget) continue;

      const profitPerUnit = sellPrice - buyPrice;
      const totalProfit = units * profitPerUnit;

      routes.push({
        buyCommodity: r.commodity_name,
        buyShop: r.buy_shop,
        buyLocation: [r.buy_city, r.buy_system].filter(Boolean).join(', '),
        buySystem: r.buy_system ?? null,
        buyPrice,
        sellShop: r.sell_shop,
        sellLocation: [r.sell_city, r.sell_system].filter(Boolean).join(', '),
        sellSystem: r.sell_system ?? null,
        sellPrice,
        profitPerUnit,
        profitPerScu: profitPerUnit / occupancy,
        totalProfit,
        totalInvestment: totalCost,
        scu,
      });
    }

    const sortKey = sort === 'profitPerScu' ? 'profitPerScu' : sort === 'profitPerUnit' ? 'profitPerUnit' : 'totalProfit';
    routes.sort((a, b) => b[sortKey] - a[sortKey]);
    return routes.slice(0, safeLimit);
  }
}
