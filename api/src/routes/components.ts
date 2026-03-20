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
      const env = String(req.query.env ?? 'live');
      const type = String(req.query.type ?? '');
      const min_size = req.query.min_size != null ? parseInt(String(req.query.min_size), 10) : undefined;
      const max_size = req.query.max_size != null ? parseInt(String(req.query.max_size), 10) : undefined;
      const search = String(req.query.search ?? '');
      const sort = String(req.query.sort ?? 'size');
      const order = String(req.query.order ?? 'asc');
      const limit = Math.min(200, parseInt(String(req.query.limit ?? '100'), 10) || 100);
      const data = await gameDataService!.components.getCompatibleComponents({
        env,
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
      const env = String(req.query.env ?? 'live');
      const data = await gameDataService!.components.getComponentTypes(env);
      sendWithETag(req, res, { success: true, data });
    }),
  );

  router.get(
    '/api/v1/components',
    requireGameData,
    asyncHandler(async (req, res) => {
      const t = Date.now();
      const filters = ComponentQuery.parse(req.query);
      const result = await gameDataService!.components.getAllComponents(filters);
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
      const env = String(req.query.env ?? 'live');
      const data = await gameDataService!.components.getComponentFilters(env);
      sendWithETag(req, res, { success: true, data });
    }),
  );

  router.get(
    '/api/v1/components/:uuid',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const comp = await gameDataService!.components.resolveComponent(req.params.uuid, env);
      if (!comp) return void res.status(404).json({ success: false, error: 'Component not found' });
      sendWithETag(req, res, { success: true, data: comp });
    }),
  );

  router.get(
    '/api/v1/components/:uuid/buy-locations',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const comp = await gameDataService!.components.resolveComponent(req.params.uuid, env);
      if (!comp) return void res.status(404).json({ success: false, error: 'Component not found' });
      const data = await gameDataService!.components.getComponentBuyLocations(String(comp.uuid), env);
      if (req.query.format === 'csv')
        return void sendCsvOrJson(req, res, data as Record<string, unknown>[], { success: true, count: data.length, data });
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );

  router.get(
    '/api/v1/components/:uuid/ships',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const comp = await gameDataService!.components.resolveComponent(req.params.uuid, env);
      if (!comp) return void res.status(404).json({ success: false, error: 'Component not found' });
      const data = await gameDataService!.components.getComponentShips(comp.uuid, env);
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );
}
