/**
 * Trade routes — commodity prices by location and best-routes calculator
 * Inspired by UEX Corp / SC Trade Tools
 */

import type { Router } from 'express';
import { asyncHandler, makeGameDataGuard, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountTradeRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);

  /**
   * GET /api/v1/trade/locations
   * All shops that have commodity price data
   */
  router.get(
    '/api/v1/trade/locations',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const locations = await gameDataService!.trade.getTradeLocations(env);
      sendWithETag(req, res, { success: true, data: locations });
    }),
  );

  /**
   * GET /api/v1/trade/prices/:commodityUuid
   * Prices for a commodity across all locations
   */
  router.get(
    '/api/v1/trade/prices/:commodityUuid',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const prices = await gameDataService!.trade.getCommodityPrices(req.params.commodityUuid, env);
      sendWithETag(req, res, { success: true, data: prices });
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
      const env = String(req.query.env ?? 'live');
      const shopId = parseInt(req.params.shopId, 10);
      if (Number.isNaN(shopId)) return void res.status(400).json({ success: false, error: 'Invalid shop ID' });
      const prices = await gameDataService!.trade.getLocationPrices(shopId, env);
      sendWithETag(req, res, { success: true, data: prices });
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
  router.get(
    '/api/v1/trade/systems',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const systems = await gameDataService!.trade.getTradeSystems(env);
      sendWithETag(req, res, { success: true, data: systems });
    }),
  );

  /**
   * GET /api/v1/trade/routes
   * Calculate best trade routes for given cargo capacity
   * Query: scu (required), budget?, env?, limit?, commodity?, buySystem?, sellSystem?, sort?
   */
  router.get(
    '/api/v1/trade/routes',
    requireGameData,
    asyncHandler(async (req, res) => {
      const scu = Number(req.query.scu);
      if (!scu || scu <= 0) {
        return void res.status(400).json({ success: false, error: 'scu query parameter is required (positive number)' });
      }
      const t = Date.now();
      const routes = await gameDataService!.trade.findBestRoutes({
        scu,
        budget: req.query.budget ? Number(req.query.budget) : undefined,
        env: req.query.env ? String(req.query.env) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        commodity: req.query.commodity ? String(req.query.commodity) : undefined,
        buySystem: req.query.buySystem ? String(req.query.buySystem) : undefined,
        sellSystem: req.query.sellSystem ? String(req.query.sellSystem) : undefined,
        sort: (['totalProfit', 'profitPerScu', 'profitPerUnit'] as const).includes(req.query.sort as 'totalProfit')
          ? (req.query.sort as 'totalProfit' | 'profitPerScu' | 'profitPerUnit')
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
