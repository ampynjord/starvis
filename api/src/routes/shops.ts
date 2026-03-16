import type { Router } from 'express';
import { ShopQuery } from '../schemas.js';
import { asyncHandler, makeGameDataGuard, sendCsvOrJson, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountShopRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);

  router.get(
    '/api/v1/shops',
    requireGameData,
    asyncHandler(async (req, res) => {
      const filters = ShopQuery.parse(req.query);
      const result = await gameDataService!.shops.getShops(filters);
      if (req.query.format === 'csv')
        return void sendCsvOrJson(req, res, result.data as Record<string, unknown>[], { success: true, ...result });
      sendWithETag(req, res, { success: true, ...result });
    }),
  );

  router.get(
    '/api/v1/shops/:id/inventory',
    requireGameData,
    asyncHandler(async (req, res) => {
      const shopId = parseInt(req.params.id, 10);
      if (Number.isNaN(shopId)) return void res.status(400).json({ success: false, error: 'Invalid shop ID' });
      const env = String(req.query.env ?? 'live');
      const data = await gameDataService!.shops.getShopInventory(shopId, env);
      if (req.query.format === 'csv')
        return void sendCsvOrJson(req, res, data as Record<string, unknown>[], { success: true, count: data.length, data });
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );
}
