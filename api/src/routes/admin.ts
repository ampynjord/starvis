import type { Router } from 'express';
import { authMiddleware } from '../middleware/index.js';
import { asyncHandler, makeGameDataGuard } from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountAdminRoutes(router: Router, deps: RouteDependencies): void {
  const { pool, shipMatrixService, gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);

  router.use('/admin', authMiddleware);

  router.post(
    '/admin/sync-ship-matrix',
    asyncHandler(async (_req, res) => {
      const result = await shipMatrixService.sync();
      res.json({ success: true, data: result });
    }),
  );

  router.get(
    '/admin/stats',
    asyncHandler(async (_req, res) => {
      const smStats = await shipMatrixService.getStats();
      const gdStats = gameDataService ? await gameDataService.getStats() : null;
      res.json({ success: true, data: { shipMatrix: smStats, gameData: gdStats } });
    }),
  );

  router.get(
    '/admin/extraction-log',
    requireGameData,
    asyncHandler(async (_req, res) => {
      const log = await gameDataService!.getExtractionLog();
      res.json({ success: true, data: log });
    }),
  );

  router.get(
    '/health',
    asyncHandler(async (_req, res) => {
      await pool.execute('SELECT 1');
      res.json({ status: 'ok', database: 'connected', gameData: gameDataService ? 'available' : 'unavailable' });
    }),
  );
}
