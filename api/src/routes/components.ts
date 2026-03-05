import type { Router } from 'express';
import { ComponentQuery } from '../schemas.js';
import { asyncHandler, makeGameDataGuard, sendCsvOrJson, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountComponentRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);

  router.get(
    '/api/v1/components/compatible',
    requireGameData,
    asyncHandler(async (req, res) => {
      const type = String(req.query.type ?? '');
      const min_size = req.query.min_size != null ? parseInt(String(req.query.min_size), 10) : undefined;
      const max_size = req.query.max_size != null ? parseInt(String(req.query.max_size), 10) : undefined;
      const search = String(req.query.search ?? '');
      const sort = String(req.query.sort ?? 'size');
      const order = String(req.query.order ?? 'asc');
      const limit = Math.min(200, parseInt(String(req.query.limit ?? '100'), 10) || 100);
      const data = await gameDataService!.getCompatibleComponents({
        type: type || undefined,
        min_size,
        max_size,
        search: search || undefined,
        sort,
        order,
        limit,
      });
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );

  router.get(
    '/api/v1/components/types',
    requireGameData,
    asyncHandler(async (req, res) => {
      const data = await gameDataService!.getComponentTypes();
      sendWithETag(req, res, { success: true, data });
    }),
  );

  router.get(
    '/api/v1/components',
    requireGameData,
    asyncHandler(async (req, res) => {
      const t = Date.now();
      const filters = ComponentQuery.parse(req.query);
      const result = await gameDataService!.getAllComponents(filters);
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
    '/api/v1/components/filters',
    requireGameData,
    asyncHandler(async (req, res) => {
      const data = await gameDataService!.getComponentFilters();
      sendWithETag(req, res, { success: true, data });
    }),
  );

  router.get(
    '/api/v1/components/:uuid',
    requireGameData,
    asyncHandler(async (req, res) => {
      const comp = await gameDataService!.resolveComponent(req.params.uuid);
      if (!comp) return void res.status(404).json({ success: false, error: 'Component not found' });
      sendWithETag(req, res, { success: true, data: comp });
    }),
  );

  router.get(
    '/api/v1/components/:uuid/buy-locations',
    requireGameData,
    asyncHandler(async (req, res) => {
      const comp = await gameDataService!.resolveComponent(req.params.uuid);
      if (!comp) return void res.status(404).json({ success: false, error: 'Component not found' });
      const data = await gameDataService!.getComponentBuyLocations(comp.uuid);
      if (req.query.format === 'csv')
        return void sendCsvOrJson(req, res, data as Record<string, unknown>[], { success: true, count: data.length, data });
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );

  router.get(
    '/api/v1/components/:uuid/ships',
    requireGameData,
    asyncHandler(async (req, res) => {
      const comp = await gameDataService!.resolveComponent(req.params.uuid);
      if (!comp) return void res.status(404).json({ success: false, error: 'Component not found' });
      const data = await gameDataService!.getComponentShips(comp.uuid);
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );
}
