import type { Router } from 'express';
import { ItemQuery } from '../schemas.js';
import { asyncHandler, makeGameDataGuard, sendCsvOrJson, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountItemRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);

  router.get(
    '/api/v1/items/types',
    requireGameData,
    asyncHandler(async (req, res) => {
      const data = await gameDataService!.items.getItemTypes();
      sendWithETag(req, res, { success: true, ...data });
    }),
  );

  router.get(
    '/api/v1/items/filters',
    requireGameData,
    asyncHandler(async (req, res) => {
      const data = await gameDataService!.items.getItemFilters();
      sendWithETag(req, res, { success: true, data });
    }),
  );

  router.get(
    '/api/v1/items',
    requireGameData,
    asyncHandler(async (req, res) => {
      const t = Date.now();
      const filters = ItemQuery.parse(req.query);
      const result = await gameDataService!.items.getAllItems(filters);
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
    '/api/v1/items/:uuid',
    requireGameData,
    asyncHandler(async (req, res) => {
      const item = await gameDataService!.items.resolveItem(req.params.uuid);
      if (!item) return void res.status(404).json({ success: false, error: 'Item not found' });
      sendWithETag(req, res, { success: true, data: item });
    }),
  );

  router.get(
    '/api/v1/items/:uuid/buy-locations',
    requireGameData,
    asyncHandler(async (req, res) => {
      const item = await gameDataService!.items.resolveItem(req.params.uuid);
      if (!item) return void res.status(404).json({ success: false, error: 'Item not found' });
      const data = await gameDataService!.items.getItemBuyLocations(String(item.uuid));
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );
}
