import type { Router } from 'express';
import { SearchQuery } from '../schemas.js';
import { asyncHandler, sendCsvOrJson, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountShipMatrixRoutes(router: Router, deps: RouteDependencies): void {
  const { shipMatrixService } = deps;

  router.get(
    '/api/v1/ship-matrix/stats',
    asyncHandler(async (req, res) => {
      const stats = await shipMatrixService.getStats();
      sendWithETag(req, res, { success: true, data: stats });
    }),
  );

  router.get(
    '/api/v1/ship-matrix',
    asyncHandler(async (req, res) => {
      const t = Date.now();
      const { search } = SearchQuery.parse(req.query);
      const data = search ? await shipMatrixService.search(search) : await shipMatrixService.getAll();
      const payload = {
        success: true,
        count: data.length,
        data,
        meta: { source: 'RSI Ship Matrix', responseTime: `${Date.now() - t}ms` },
      };
      if (req.query.format === 'csv') return void sendCsvOrJson(req, res, data as Record<string, unknown>[], payload);
      sendWithETag(req, res, payload);
    }),
  );

  router.get(
    '/api/v1/ship-matrix/:id',
    asyncHandler(async (req, res) => {
      const id = parseInt(req.params.id, 10);
      const ship = Number.isNaN(id) ? await shipMatrixService.getByName(req.params.id) : await shipMatrixService.getById(id);
      if (!ship) return void res.status(404).json({ success: false, error: 'Not found' });
      sendWithETag(req, res, { success: true, data: ship });
    }),
  );
}
