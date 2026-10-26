import type { Router } from 'express';
import { ChangelogQuery, GameVersionsQuery, TranslationQuery } from '../schemas.js';
import {
  asyncHandler,
  getQueryEnv,
  getQueryString,
  makeGameDataGuard,
  mountEnvDataRoute,
  sendDataWithETag,
  sendPaginatedWithETag,
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
    '/api/v1/system/sitemap-entries',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = getQueryEnv(req);
      const [ships, commodities, locations, commLinks, galactapedia, minerals, components, items] = await Promise.all([
        deps.prisma.ship.findMany({
          where: { env },
          select: { uuid: true, extractedAt: true },
          orderBy: { name: 'asc' },
        }),
        deps.prisma.commodity.findMany({
          where: { env },
          select: { uuid: true, updatedAt: true },
          orderBy: { name: 'asc' },
        }),
        deps.prisma.location.findMany({
          where: { env, hideInStarmap: false },
          select: { uuid: true, extractedAt: true },
          orderBy: { name: 'asc' },
        }),
        deps.prisma.commLink.findMany({
          select: { id: true, slug: true, publishedAt: true },
          orderBy: { id: 'desc' },
        }),
        deps.prisma.galactapedia.findMany({
          select: { id: true, slug: true, updatedAt: true },
          orderBy: { title: 'asc' },
        }),
        deps.prisma.miningElement.findMany({
          where: { env },
          select: { uuid: true },
        }),
        deps.prisma.component.findMany({
          where: { env },
          select: { uuid: true, updatedAt: true },
          orderBy: { name: 'asc' },
        }),
        deps.prisma.item.findMany({
          where: { env },
          select: { uuid: true, updatedAt: true },
          orderBy: { name: 'asc' },
        }),
      ]);

      sendDataWithETag(req, res, {
        ships,
        commodities,
        locations,
        commLinks,
        galactapedia,
        minerals,
        components,
        items,
      });
    }),
  );

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

  router.get(
    '/api/v1/translations',
    requireGameData,
    asyncHandler(async (req, res) => {
      const startedAt = Date.now();
      const q = TranslationQuery.parse(req.query);
      const result = await gameDataService!.getTranslations({
        env: q.env,
        domain: q.domain,
        search: q.search,
        page: q.page,
        limit: q.limit,
      });
      sendPaginatedWithETag(req, res, result, startedAt);
    }),
  );

  router.get(
    '/api/v1/translations/:id',
    requireGameData,
    asyncHandler(async (req, res) => {
      const row = await gameDataService!.getTranslationById(req.params.id, getQueryEnv(req));
      if (!row) {
        return void res.status(404).json({ success: false, error: 'Translation not found' });
      }
      sendDataWithETag(req, res, row);
    }),
  );

  router.get(
    '/api/v1/refineries',
    requireGameData,
    asyncHandler(async (req, res) => {
      const data = await gameDataService!.getRefineries(getQueryEnv(req));
      sendDataWithETag(req, res, data);
    }),
  );

  router.get(
    '/api/v1/datasets',
    requireGameData,
    asyncHandler(async (req, res) => {
      const data = await gameDataService!.getDatasetManifest(getQueryEnv(req));
      sendDataWithETag(req, res, data);
    }),
  );

  router.get(
    '/api/v1/datasets/:pack',
    requireGameData,
    asyncHandler(async (req, res) => {
      const data = await gameDataService!.getDatasetPack(req.params.pack, getQueryEnv(req));
      if (!data) {
        return void res.status(404).json({ success: false, error: 'Dataset pack not found' });
      }
      sendDataWithETag(req, res, data);
    }),
  );

  router.get(
    '/api/v1/rsi/roadmap',
    requireGameData,
    asyncHandler(async (req, res) => {
      const data = await gameDataService!.getRsiRoadmap();
      sendDataWithETag(req, res, data);
    }),
  );

  router.get(
    '/api/v1/rsi/status',
    requireGameData,
    asyncHandler(async (req, res) => {
      const data = await gameDataService!.getRsiStatus();
      sendDataWithETag(req, res, data);
    }),
  );

  router.get(
    '/api/v1/rsi/organizations/:symbol',
    requireGameData,
    asyncHandler(async (req, res) => {
      const data = await gameDataService!.getRsiOrganization(req.params.symbol);
      if (!data) {
        return void res.status(404).json({ success: false, error: 'Organization not found' });
      }
      sendDataWithETag(req, res, data);
    }),
  );
}
