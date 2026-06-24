import type { Router } from 'express';
import { requireJwtAdmin } from '../middleware/index.js';
import { buildApiSupervisionSnapshot } from '../services/api-supervision-service.js';
import { ApiTokenService } from '../services/api-token-service.js';
import { listPersistedRequestHistory } from '../services/request-log-service.js';
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
      const requestedScope = String(req.query.scope ?? 'all');
      const scope = requestedScope === 'external' || requestedScope === 'web' ? requestedScope : 'all';
      const role = String(req.query.role ?? '');
      const userId = Number.parseInt(String(req.query.userId ?? ''), 10);
      res.json({
        success: true,
        data: await listPersistedRequestHistory({
          scope,
          limit,
          userId: Number.isInteger(userId) && userId > 0 ? userId : undefined,
          role: role === 'user' || role === 'developer' || role === 'admin' ? role : undefined,
        }),
      });
    }),
  );

  router.get(
    '/admin/api-supervision',
    asyncHandler(async (_req, res) => {
      res.json({ success: true, data: await buildApiSupervisionSnapshot(prisma) });
    }),
  );

  router.get(
    '/admin/api-tokens',
    asyncHandler(async (req, res) => {
      const limit = Number.parseInt(String(req.query.limit ?? '200'), 10);
      res.json({ success: true, data: await new ApiTokenService(prisma).listForAdmin(limit) });
    }),
  );

  router.delete(
    '/admin/api-tokens/:id',
    asyncHandler(async (req, res) => {
      const tokenId = Number(req.params.id);
      if (!Number.isInteger(tokenId) || tokenId <= 0) {
        return void res.status(400).json({ success: false, error: 'Invalid token id' });
      }
      const revoked = await new ApiTokenService(prisma).revokeForAdmin(tokenId);
      if (!revoked) return void res.status(404).json({ success: false, error: 'API token not found or already revoked' });
      res.json({ success: true, data: revoked });
    }),
  );

  router.post(
    '/admin/maintenance/prune-old-env',
    asyncHandler(async (_req, res) => {
      // Deletes all rows in game schema tables where env is not 'live' or 'ptu'
      const tables = [
        'ships',
        'components',
        'items',
        'commodities',
        'missions',
        'crafting_recipes',
        'mining_elements',
        'shops',
        'starmap_systems',
      ];
      const results: Record<string, number> = {};

      for (const table of tables) {
        try {
          const count = await prisma.$executeRawUnsafe(`DELETE FROM game.${table} WHERE env NOT IN ('live', 'ptu');`);
          results[table] = count;
        } catch (_e) {
          // ignore if table doesn't have env or doesn't exist
        }
      }

      res.json({ success: true, data: results });
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
