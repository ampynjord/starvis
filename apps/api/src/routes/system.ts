import type { Router } from 'express';
import { ChangelogQuery } from '../schemas.js';
import { asyncHandler, getQueryString, makeGameDataGuard, mountEnvDataRoute, sendDataWithETag, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountSystemRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);

  router.get(
    '/api/v1/changelog/summary',
    requireGameData,
    asyncHandler(async (req, res) => {
      const data = await gameDataService!.getChangelogSummary();
      sendWithETag(req, res, { success: true, data });
    }),
  );

  router.get(
    '/api/v1/changelog',
    requireGameData,
    asyncHandler(async (req, res) => {
      const filters = ChangelogQuery.parse(req.query);
      const result = await gameDataService!.getChangelog({
        limit: filters.limit,
        offset: filters.offset,
        entityType: filters.entity_type,
        changeType: filters.change_type,
      });
      sendWithETag(req, res, { success: true, ...result });
    }),
  );

  mountEnvDataRoute(router, '/api/v1/stats/overview', requireGameData, (env) => gameDataService!.getPublicStats(env));

  router.get(
    '/api/v1/version',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = getQueryString(req, 'env') ?? 'live';
      const latest = await gameDataService!.getLatestExtraction(env);
      sendDataWithETag(req, res, latest || { message: 'No extraction yet' });
    }),
  );
}
