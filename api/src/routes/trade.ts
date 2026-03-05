/**
 * Trade routes — commodity prices by location and best-routes calculator
 * Inspired by UEX Corp / SC Trade Tools
 */
import type { Router } from 'express';
import { asyncHandler, makeGameDataGuard, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';
import type { Pool } from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2/promise';

type Row = RowDataPacket & Record<string, unknown>;

async function getCommodityPrices(pool: Pool, commodityUuid?: string, system?: string): Promise<Row[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (commodityUuid) { where.push('cp.commodity_uuid = ?'); params.push(commodityUuid); }
  if (system)        { where.push('cp.system_name = ?');    params.push(system); }
  const wSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.execute<Row[]>(
    `SELECT cp.*, c.name as commodity_name, c.type as commodity_type, c.symbol
     FROM commodity_prices cp
     JOIN commodities c ON cp.commodity_uuid = c.uuid
     ${wSql}
     ORDER BY cp.system_name, cp.location_name`,
    params,
  );
  return rows;
}

async function getBestRoutes(pool: Pool, opts: {
  cargo_scu?: number;
  budget?: number;
  system?: string;
}): Promise<Row[]> {
  // Join commodity_prices with itself (buy + sell) to find arbitrage routes
  const cargo = Math.max(1, opts.cargo_scu ?? 1);
  const systemFilter = opts.system ? 'AND b.system_name = ? AND s.system_name = ?' : '';
  const params: (string | number)[] = opts.system ? [opts.system, opts.system] : [];
  const [rows] = await pool.execute<Row[]>(
    `SELECT
       c.name   AS commodity_name,
       c.symbol AS commodity_symbol,
       c.type   AS commodity_type,
       b.location_name AS buy_location,
       b.system_name   AS buy_system,
       b.buy_price,
       s.location_name AS sell_location,
       s.system_name   AS sell_system,
       s.sell_price,
       (s.sell_price - b.buy_price) AS profit_per_scu,
       ((s.sell_price - b.buy_price) * ${Number(cargo)}) AS total_profit
     FROM commodity_prices b
     JOIN commodity_prices s ON b.commodity_uuid = s.commodity_uuid
     JOIN commodities c ON b.commodity_uuid = c.uuid
     WHERE b.buy_price  > 0
       AND s.sell_price > 0
       AND s.sell_price > b.buy_price
       ${systemFilter}
     ORDER BY profit_per_scu DESC
     LIMIT 50`,
    params,
  );
  return rows;
}

export function mountTradeRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService: _gs, pool } = deps as RouteDependencies & { pool: Pool };
  const requireGameData = makeGameDataGuard(_gs);

  // GET /api/v1/trade/prices?commodity_uuid=...&system=...
  router.get(
    '/api/v1/trade/prices',
    requireGameData,
    asyncHandler(async (req, res) => {
      const commodityUuid = String(req.query.commodity_uuid ?? '');
      const system        = String(req.query.system ?? '');
      const data = await getCommodityPrices(pool, commodityUuid || undefined, system || undefined);
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );

  // GET /api/v1/trade/routes?cargo_scu=10&system=Stanton
  router.get(
    '/api/v1/trade/routes',
    requireGameData,
    asyncHandler(async (req, res) => {
      const cargo  = parseInt(String(req.query.cargo_scu ?? '1'), 10) || 1;
      const system = String(req.query.system ?? '');
      const data = await getBestRoutes(pool, { cargo_scu: cargo, system: system || undefined });
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );

  // GET /api/v1/trade/locations
  router.get(
    '/api/v1/trade/locations',
    requireGameData,
    asyncHandler(async (req, res) => {
      const system = String(req.query.system ?? '');
      const where  = system ? 'WHERE system_name = ?' : '';
      const params = system ? [system] : [];
      const [rows] = await (pool as Pool).execute<Row[]>(
        `SELECT DISTINCT location_name, system_name FROM commodity_prices ${where} ORDER BY system_name, location_name`,
        params,
      );
      sendWithETag(req, res, { success: true, count: rows.length, data: rows });
    }),
  );
}
