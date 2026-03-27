/**
 * Trade routes — commodity prices by location and best-routes calculator
 * Inspired by UEX Corp / SC Trade Tools
 */

import type { Router } from 'express';
import {
  asyncHandler,
  getQueryNumber,
  getQueryString,
  makeGameDataGuard,
  mountEnvDataRoute,
  sendDataWithETag,
  sendWithETag,
} from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountTradeRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);

  /**
   * GET /api/v1/trade/locations
   * All shops that have commodity price data
   */
  mountEnvDataRoute(router, '/api/v1/trade/locations', requireGameData, (env) => gameDataService!.trade.getTradeLocations(env));

  /**
   * GET /api/v1/trade/prices/:commodityUuid
   * Prices for a commodity across all locations
   */
  router.get(
    '/api/v1/trade/prices/:commodityUuid',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = getQueryString(req, 'env') ?? 'live';
      const prices = await gameDataService!.trade.getCommodityPrices(req.params.commodityUuid, env);
      sendDataWithETag(req, res, prices);
    }),
  );

  /**
   * GET /api/v1/trade/location/:shopId/prices
   * All commodity prices at a given shop
   */
  router.get(
    '/api/v1/trade/location/:shopId/prices',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = getQueryString(req, 'env') ?? 'live';
      const shopId = parseInt(req.params.shopId, 10);
      if (Number.isNaN(shopId)) return void res.status(400).json({ success: false, error: 'Invalid shop ID' });
      const prices = await gameDataService!.trade.getLocationPrices(shopId, env);
      sendDataWithETag(req, res, prices);
    }),
  );

  /**
   * POST /api/v1/trade/prices
   * Submit or update a commodity price report
   * Body: { commodityUuid, shopId, buyPrice?, sellPrice?, env? }
   */
  router.post(
    '/api/v1/trade/prices',
    requireGameData,
    asyncHandler(async (req, res) => {
      const { commodityUuid, shopId, buyPrice, sellPrice, env } = req.body ?? {};
      if (!commodityUuid || !shopId) {
        return void res.status(400).json({ success: false, error: 'commodityUuid and shopId are required' });
      }
      if (buyPrice == null && sellPrice == null) {
        return void res.status(400).json({ success: false, error: 'At least one of buyPrice or sellPrice is required' });
      }
      const result = await gameDataService!.trade.reportPrice({
        commodityUuid: String(commodityUuid),
        shopId: Number(shopId),
        buyPrice: buyPrice != null ? Number(buyPrice) : undefined,
        sellPrice: sellPrice != null ? Number(sellPrice) : undefined,
        env: env ? String(env) : undefined,
      });
      res.json({ success: true, data: result });
    }),
  );

  /**
   * GET /api/v1/trade/systems
   * All distinct systems with trade data
   */
  mountEnvDataRoute(router, '/api/v1/trade/systems', requireGameData, (env) => gameDataService!.trade.getTradeSystems(env));

  /**
   * GET /api/v1/trade/routes
   * Calculate best trade routes for given cargo capacity
   * Query: scu (required), budget?, env?, limit?, commodity?, buySystem?, sellSystem?, sort?
   */
  router.get(
    '/api/v1/trade/routes',
    requireGameData,
    asyncHandler(async (req, res) => {
      const scu = getQueryNumber(req, 'scu');
      const sortParam = getQueryString(req, 'sort');
      if (!scu || scu <= 0) {
        return void res.status(400).json({ success: false, error: 'scu query parameter is required (positive number)' });
      }
      const t = Date.now();
      const routes = await gameDataService!.trade.findBestRoutes({
        scu,
        budget: getQueryNumber(req, 'budget'),
        env: getQueryString(req, 'env'),
        limit: getQueryNumber(req, 'limit'),
        commodity: getQueryString(req, 'commodity'),
        buySystem: getQueryString(req, 'buySystem'),
        sellSystem: getQueryString(req, 'sellSystem'),
        sort: (['totalProfit', 'profitPerScu', 'profitPerUnit'] as const).includes(sortParam as 'totalProfit')
          ? (sortParam as 'totalProfit' | 'profitPerScu' | 'profitPerUnit')
          : undefined,
      });
      sendWithETag(req, res, {
        success: true,
        count: routes.length,
        data: routes,
        meta: { responseTime: `${Date.now() - t}ms` },
      });
    }),
  );
}
