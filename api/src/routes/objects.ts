import type { Router } from 'express';
import { asyncHandler, getQueryEnv, getQueryString, makeGameDataGuard, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountObjectRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);

  router.get(
    '/api/v1/objects/:type/:id',
    requireGameData,
    asyncHandler(async (req, res) => {
      const detail = await gameDataService!.getObjectDetail(req.params.type, req.params.id, {
        env: getQueryEnv(req),
        include: getQueryString(req, 'include'),
      });
      if (!detail) return void res.status(404).json({ success: false, error: 'Object not found' });
      sendWithETag(req, res, { success: true, data: detail });
    }),
  );
}
