import type { Router } from 'express';
import { PaintQuery } from '../schemas.js';
import { asyncHandler, getQueryString, makeGameDataGuard, sendCsvOrJson, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountPaintRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);

  router.get(
    '/api/v1/paints/filters',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = getQueryString(req, 'env') ?? 'live';
      const result = await gameDataService!.paints.getPaintFilters(env);
      sendWithETag(req, res, { success: true, ...result });
    }),
  );

  router.get(
    '/api/v1/paints',
    requireGameData,
    asyncHandler(async (req, res) => {
      const t = Date.now();
      const filters = PaintQuery.parse(req.query);
      const result = await gameDataService!.paints.getAllPaints(filters);
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
    '/api/v1/paints/groups',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = getQueryString(req, 'env') ?? 'live';
      const result = await gameDataService!.paints.getPaintGroups({
        env,
        search: getQueryString(req, 'search'),
        manufacturer: getQueryString(req, 'manufacturer'),
      });
      sendWithETag(req, res, { success: true, data: result });
    }),
  );
}
