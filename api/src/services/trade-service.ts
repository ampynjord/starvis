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

type PriceSourceStatus = 'available' | 'empty' | 'unavailable' | 'not_checked';

export interface CommodityPriceSourceMeta {
  status: PriceSourceStatus;
  count: number | null;
  error?: 'query_failed';
}

export interface CommodityPriceResult {
  data: Row[];
  source: 'uex' | 'p4k' | 'none';
  sourcePriority: ['uex', 'p4k'];
  fallbackUsed: boolean;
  reason?: 'uex_available' | 'uex_empty_p4k_available' | 'uex_unavailable_p4k_available' | 'no_uex_or_p4k_price_found';
  sources: {
    uex: CommodityPriceSourceMeta;
    p4k: CommodityPriceSourceMeta;
  };
}

export class TradeService {
  constructor(private getClient: (env: string) => PrismaClient) {}

  async getTradeSystems(env = 'live'): Promise<string[]> {
    const prisma = this.getClient(env);
    try {
      const uexRows = await prisma.$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT DISTINCT t.star_system as system
         FROM game.uex_market_prices p
         LEFT JOIN game.uex_terminals t ON t.uex_id = p.terminal_uex_id AND t.env = p.env
         WHERE p.env = ? AND p.entity_kind = 'commodity' AND t.star_system IS NOT NULL AND t.star_system != ''
         ORDER BY t.star_system`),
        env,
      );
      if (uexRows.length) return uexRows.map((r) => String(r.system));
    } catch {
      // Older deployments without UEX generic prices fall back to local reports.
    }
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
    try {
      const uexRows = await prisma.$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT DISTINCT
              t.uex_id as id,
              t.name,
              COALESCE(t.city, t.outpost, t.space_station, t.moon, t.planet, t.star_system) as location,
              t.star_system as system,
              COALESCE(t.moon, t.planet, t.orbit) as planet_moon,
              t.city,
              t.type as shop_type,
              'uex' as source
         FROM game.uex_market_prices p
         LEFT JOIN game.uex_terminals t ON t.uex_id = p.terminal_uex_id AND t.env = p.env
         WHERE p.env = ? AND p.entity_kind = 'commodity' AND t.uex_id IS NOT NULL
         ORDER BY t.star_system, t.city, t.name`),
        env,
      );
      if (uexRows.length) return convertBigIntToNumber(uexRows);
    } catch {
      // Fallback below.
    }
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
    const result = await this.getCommodityPriceResult(commodityUuid, env);
    return result.data;
  }

  async getCommodityPriceResult(commodityUuid: string, env = 'live'): Promise<CommodityPriceResult> {
    const prisma = this.getClient(env);
    let uexStatus: CommodityPriceSourceMeta = { status: 'not_checked', count: null };
    try {
      const uexRows = await prisma.$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT p.id, p.entity_kind, p.entity_name,
              p.price_buy as buy_price, p.price_sell as sell_price, p.date_modified as reported_at,
              t.uex_id as shop_id, COALESCE(t.name, p.terminal_name) as shop_name,
              t.star_system as system, COALESCE(t.moon, t.planet, t.orbit) as planet_moon, t.city,
              'uex' as source
       FROM game.uex_market_prices p
       LEFT JOIN game.uex_terminals t ON t.uex_id = p.terminal_uex_id AND t.env = p.env
       WHERE p.env = ?
         AND p.entity_kind IN ('commodity', 'item', 'component')
         AND (
           p.entity_uuid = ?
           OR p.entity_uuid IN (
             SELECT i.uuid
             FROM game.commodities c
             JOIN game.items i
               ON i.env = c.env
              AND LOWER(i.class_name) = LOWER(REGEXP_REPLACE(c.class_name, '^Commodities_', ''))
             WHERE c.env = ? AND c.uuid = ?
             UNION
             SELECT comp.uuid
             FROM game.commodities c
             JOIN game.components comp
               ON comp.env = c.env
              AND LOWER(comp.class_name) = LOWER(REGEXP_REPLACE(c.class_name, '^Commodities_', ''))
             WHERE c.env = ? AND c.uuid = ?
           )
         )
         AND p.is_available = TRUE
       ORDER BY p.entity_kind, t.star_system, t.city, t.name`),
        env,
        commodityUuid,
        env,
        commodityUuid,
        env,
        commodityUuid,
      );
      if (uexRows.length) {
        const data = convertBigIntToNumber(uexRows);
        return {
          data,
          source: 'uex',
          sourcePriority: ['uex', 'p4k'],
          fallbackUsed: false,
          reason: 'uex_available',
          sources: {
            uex: { status: 'available', count: data.length },
            p4k: { status: 'not_checked', count: null },
          },
        };
      }
      uexStatus = { status: 'empty', count: 0 };
    } catch {
      uexStatus = { status: 'unavailable', count: null, error: 'query_failed' };
    }
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
    const data = convertBigIntToNumber(rows);
    if (data.length) {
      const reason = uexStatus.status === 'unavailable' ? 'uex_unavailable_p4k_available' : 'uex_empty_p4k_available';
      return {
        data,
        source: 'p4k',
        sourcePriority: ['uex', 'p4k'],
        fallbackUsed: true,
        reason,
        sources: {
          uex: uexStatus,
          p4k: { status: 'available', count: data.length },
        },
      };
    }

    return {
      data: [],
      source: 'none',
      sourcePriority: ['uex', 'p4k'],
      fallbackUsed: uexStatus.status !== 'not_checked',
      reason: 'no_uex_or_p4k_price_found',
      sources: {
        uex: uexStatus,
        p4k: { status: 'empty', count: 0 },
      },
    };
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
    const uexRoutes = await this.findBestUexRoutes({ scu, budget, env, limit: safeLimit, commodity, buySystem, sellSystem, sort }).catch(
      () => [],
    );
    if (uexRoutes.length) return uexRoutes;

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

  private async findBestUexRoutes(opts: {
    scu: number;
    budget?: number;
    env: string;
    limit: number;
    commodity?: string;
    buySystem?: string;
    sellSystem?: string;
    sort?: 'totalProfit' | 'profitPerScu' | 'profitPerUnit';
  }): Promise<TradeRoute[]> {
    const { scu, budget, env, limit, commodity, buySystem, sellSystem, sort = 'totalProfit' } = opts;
    const prisma = this.getClient(env);
    const where = [
      'buy_p.env = ?',
      "buy_p.entity_kind = 'commodity'",
      'buy_p.entity_uuid IS NOT NULL',
      'buy_p.price_buy IS NOT NULL',
      'buy_p.price_buy > 0',
      'sell_p.price_sell IS NOT NULL',
      'sell_p.price_sell > buy_p.price_buy',
    ];
    const params: (string | number)[] = [env];
    if (commodity) {
      where.push('buy_p.entity_name ILIKE ?');
      params.push(`%${commodity}%`);
    }
    if (buySystem) {
      where.push('buy_t.star_system = ?');
      params.push(buySystem);
    }
    if (sellSystem) {
      where.push('sell_t.star_system = ?');
      params.push(sellSystem);
    }
    params.push(limit * 3);

    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT
        buy_p.entity_name as commodity_name,
        c.occupancy_scu,
        buy_p.price_buy as buy_price,
        COALESCE(buy_t.name, buy_p.terminal_name) as buy_shop,
        buy_t.star_system as buy_system,
        buy_t.city as buy_city,
        sell_p.price_sell as sell_price,
        COALESCE(sell_t.name, sell_p.terminal_name) as sell_shop,
        sell_t.star_system as sell_system,
        sell_t.city as sell_city
       FROM game.uex_market_prices buy_p
       INNER JOIN game.uex_market_prices sell_p ON sell_p.entity_uuid = buy_p.entity_uuid
         AND sell_p.env = buy_p.env
         AND COALESCE(sell_p.terminal_uex_id, -1) != COALESCE(buy_p.terminal_uex_id, -1)
       LEFT JOIN game.uex_terminals buy_t ON buy_t.uex_id = buy_p.terminal_uex_id AND buy_t.env = buy_p.env
       LEFT JOIN game.uex_terminals sell_t ON sell_t.uex_id = sell_p.terminal_uex_id AND sell_t.env = sell_p.env
       LEFT JOIN game.commodities c ON c.uuid = buy_p.entity_uuid AND c.env = buy_p.env
       WHERE ${where.join(' AND ')}
       ORDER BY (sell_p.price_sell - buy_p.price_buy) DESC
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
        totalProfit: units * profitPerUnit,
        totalInvestment: totalCost,
        scu,
      });
    }
    const sortKey = sort === 'profitPerScu' ? 'profitPerScu' : sort === 'profitPerUnit' ? 'profitPerUnit' : 'totalProfit';
    return routes.sort((a, b) => b[sortKey] - a[sortKey]).slice(0, limit);
  }
}
