import type { Router } from 'express';
import { CommodityQuery } from '../schemas.js';
import { asyncHandler, makeGameDataGuard, sendCsvOrJson, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountCommodityRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);

  router.get(
    '/api/v1/commodities/types',
    requireGameData,
    asyncHandler(async (req, res) => {
      const data = await gameDataService!.getCommodityTypes();
      sendWithETag(req, res, { success: true, data: data.types.map((t) => t.type) });
    }),
  );

  router.get(
    '/api/v1/commodities',
    requireGameData,
    asyncHandler(async (req, res) => {
      const t = Date.now();
      const filters = CommodityQuery.parse(req.query);
      const result = await gameDataService!.getAllCommodities(filters);
      const payload = {
        success: true,
        count: result.data.length,
        total: result.total,
        page: result.page,
        limit: result.limit,
        pages: result.pages,
        data: result.data,
        meta: { source: 'Game Data', responseTime: `${Date.now() - t}ms` },
      };
      if (req.query.format === 'csv') return void sendCsvOrJson(req, res, result.data as Record<string, unknown>[], payload);
      sendWithETag(req, res, payload);
    }),
  );

  router.get(
    '/api/v1/commodities/:uuid',
    requireGameData,
    asyncHandler(async (req, res) => {
      const commodity = await gameDataService!.getCommodityByUuid(req.params.uuid);
      if (!commodity) return void res.status(404).json({ success: false, error: 'Commodity not found' });
      sendWithETag(req, res, { success: true, data: commodity });
    }),
  );
}
