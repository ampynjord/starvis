import type { Router } from 'express';
import type { GameInsightDatasetName } from '../services/game-insight-service.js';
import {
  asyncHandler,
  getQueryEnv,
  getQueryNumber,
  getQueryString,
  makeGameDataGuard,
  sendDataWithETag,
  sendPaginatedWithETag,
} from './helpers.js';
import type { RouteDependencies } from './types.js';

const datasetRoutes: Array<{ path: string; name: GameInsightDatasetName }> = [
  { path: 'factions', name: 'factions' },
  { path: 'reputation-standings', name: 'reputation-standings' },
  { path: 'reputation-scopes', name: 'reputation-scopes' },
  { path: 'loot-tables', name: 'loot-tables' },
  { path: 'loot-table-entries', name: 'loot-table-entries' },
  { path: 'loot-archetypes', name: 'loot-archetypes' },
  { path: 'blueprint-rewards', name: 'blueprint-rewards' },
  { path: 'ammo', name: 'ammo' },
  { path: 'inventory-containers', name: 'inventory-containers' },
];

export function mountGameInsightRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);

  router.get(
    '/api/v1/game-insights/categories',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = getQueryEnv(req);
      const data = await gameDataService!.insights.getCategories(env);
      sendDataWithETag(req, res, data, data.length);
    }),
  );

  router.get(
    '/api/v1/game-insights',
    requireGameData,
    asyncHandler(async (req, res) => {
      const startedAt = Date.now();
      const result = await gameDataService!.insights.getInsights({
        env: getQueryEnv(req),
        page: getQueryNumber(req, 'page'),
        limit: getQueryNumber(req, 'limit'),
        category: getQueryString(req, 'category'),
        sourceType: getQueryString(req, 'sourceType') ?? getQueryString(req, 'source_type'),
        search: getQueryString(req, 'search') ?? getQueryString(req, 'q'),
        faction: getQueryString(req, 'faction'),
        relatedClass: getQueryString(req, 'relatedClass') ?? getQueryString(req, 'related_class'),
      });
      sendPaginatedWithETag(req, res, result, startedAt);
    }),
  );

  for (const route of datasetRoutes) {
    router.get(
      `/api/v1/game-insights/${route.path}`,
      requireGameData,
      asyncHandler(async (req, res) => {
        const startedAt = Date.now();
        const result = await gameDataService!.insights.getDataset(route.name, {
          env: getQueryEnv(req),
          page: getQueryNumber(req, 'page'),
          limit: getQueryNumber(req, 'limit'),
          search: getQueryString(req, 'search') ?? getQueryString(req, 'q'),
        });
        sendPaginatedWithETag(req, res, result, startedAt);
      }),
    );
  }

  router.get(
    '/api/v1/game-insights/:category/:uuid',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = getQueryEnv(req);
      const row = await gameDataService!.insights.getInsight(req.params.uuid, req.params.category, env);
      if (!row) return void res.status(404).json({ success: false, error: 'Game insight not found' });
      sendDataWithETag(req, res, row);
    }),
  );
}
