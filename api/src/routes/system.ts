import type { Router } from 'express';
import { ChangelogQuery, GameVersionsQuery } from '../schemas.js';
import {
  asyncHandler,
  getQueryEnv,
  getQueryString,
  makeGameDataGuard,
  mountEnvDataRoute,
  sendDataWithETag,
  sendWithETag,
} from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountSystemRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);

  router.get(
    '/api/v1/changelog/summary',
    requireGameData,
    asyncHandler(async (req, res) => {
      const { env } = ChangelogQuery.parse(req.query);
      const data = await gameDataService!.getChangelogSummary(env);
      sendWithETag(req, res, { success: true, data });
    }),
  );

  router.get(
    '/api/v1/changelog',
    requireGameData,
    asyncHandler(async (req, res) => {
      const filters = ChangelogQuery.parse(req.query);
      const result = await gameDataService!.getChangelog({
        env: filters.env,
        limit: filters.limit,
        offset: filters.offset,
        entityType: filters.entity_type,
        changeType: filters.change_type,
        markersOnly: filters.markers_only === 'true',
      });
      sendWithETag(req, res, { success: true, ...result });
    }),
  );

  mountEnvDataRoute(router, '/api/v1/stats/overview', requireGameData, (env) => gameDataService!.getPublicStats(env));

  router.get(
    '/api/v1/stats/latest',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = getQueryEnv(req);
      const data = await gameDataService!.getLatestStats(env);
      sendDataWithETag(req, res, data);
    }),
  );

  router.get(
    '/api/v1/version',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = getQueryString(req, 'env') ?? 'live';
      const latest = await gameDataService!.getLatestExtraction(env);
      sendDataWithETag(req, res, latest || { message: 'No extraction yet' });
    }),
  );

  router.get(
    '/api/v1/game-versions',
    requireGameData,
    asyncHandler(async (req, res) => {
      const q = GameVersionsQuery.parse(req.query);
      const result = await gameDataService!.getGameVersions({ env: q.env, limit: q.limit, offset: q.offset });
      sendWithETag(req, res, { success: true, total: result.total, data: result.data });
    }),
  );

  router.get(
    '/api/v1/game-versions/default',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = getQueryString(req, 'env') ?? 'live';
      const latest = await gameDataService!.getLatestExtraction(env);
      sendDataWithETag(req, res, latest || { message: `No extraction for env: ${env}` });
    }),
  );

  router.get(
    '/api/v1/game-versions/:version/changelog',
    requireGameData,
    asyncHandler(async (req, res) => {
      const result = await gameDataService!.getVersionChangelog(req.params.version, {
        env: getQueryEnv(req),
        limit: getQueryString(req, 'limit'),
        offset: getQueryString(req, 'offset'),
      });
      sendWithETag(req, res, { success: true, ...result });
    }),
  );

  router.get(
    '/api/v1/game-versions/:version/changelog/changes',
    requireGameData,
    asyncHandler(async (req, res) => {
      const result = await gameDataService!.getVersionChangelog(req.params.version, {
        env: getQueryEnv(req),
        limit: getQueryString(req, 'limit'),
        offset: getQueryString(req, 'offset'),
        changesOnly: true,
      });
      sendWithETag(req, res, { success: true, ...result });
    }),
  );
}
