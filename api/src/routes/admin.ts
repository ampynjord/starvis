import type { Router } from 'express';
import { requireJwtAdmin } from '../middleware/index.js';
import { listRequestLogs } from '../services/request-log-service.js';
import { asyncHandler, makeGameDataGuard } from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountAdminRoutes(router: Router, deps: RouteDependencies): void {
  const { prisma, shipMatrixService, gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);

  // Admin routes — accepte ADMIN_API_KEY (X-Api-Key) OU JWT avec role=admin
  router.use('/admin', requireJwtAdmin);

  router.get(
    '/admin/stats',
    asyncHandler(async (_req, res) => {
      const smStats = await shipMatrixService.getStats();
      const gdStats = gameDataService ? await gameDataService.getStats(String(_req.query.env ?? 'live')) : null;
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
    '/admin/request-logs',
    asyncHandler(async (req, res) => {
      const limit = Number.parseInt(String(req.query.limit ?? '100'), 10);
      res.json({ success: true, data: listRequestLogs(limit) });
    }),
  );

  router.get(
    '/health',
    asyncHandler(async (_req, res) => {
      await prisma.$queryRawUnsafe('SELECT 1');
      res.json({ status: 'ok', database: 'connected', gameData: gameDataService ? 'available' : 'unavailable' });
    }),
  );
}
