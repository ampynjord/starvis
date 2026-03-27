import type { Router } from 'express';
import {
  asyncHandler,
  getQueryNumber,
  getQueryString,
  makeGameDataGuard,
  mountEnvDataRoute,
  sendDataWithETag,
  sendPaginatedWithETag,
} from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountMissionRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);

  /**
   * GET /api/v1/missions/types
   * Lists all distinct mission types
   */
  mountEnvDataRoute(router, '/api/v1/missions/types', requireGameData, (env) => gameDataService!.missions.getMissionTypes(env));

  /**
   * GET /api/v1/missions/factions
   * Lists all distinct factions
   */
  mountEnvDataRoute(router, '/api/v1/missions/factions', requireGameData, (env) => gameDataService!.missions.getFactions(env));

  /**
   * GET /api/v1/missions/systems
   * Lists all distinct mission location systems
   */
  mountEnvDataRoute(router, '/api/v1/missions/systems', requireGameData, (env) => gameDataService!.missions.getSystems(env));

  /**
   * GET /api/v1/missions/categories
   * Lists all distinct mission categories
   */
  mountEnvDataRoute(router, '/api/v1/missions/categories', requireGameData, (env) => gameDataService!.missions.getCategories(env));

  /**
   * GET /api/v1/missions
   * Paginated mission list with optional filters:
   *   env, type, legal, shared, faction, system, category, unique, minReward, maxReward, search, page, limit
   */
  router.get(
    '/api/v1/missions',
    requireGameData,
    asyncHandler(async (req, res) => {
      const t = Date.now();
      const result = await gameDataService!.missions.getMissions({
        env: getQueryString(req, 'env'),
        type: getQueryString(req, 'type'),
        legal: getQueryString(req, 'legal'),
        shared: getQueryString(req, 'shared'),
        faction: getQueryString(req, 'faction'),
        system: getQueryString(req, 'system'),
        category: getQueryString(req, 'category'),
        unique: getQueryString(req, 'unique'),
        minReward: getQueryNumber(req, 'minReward'),
        maxReward: getQueryNumber(req, 'maxReward'),
        search: getQueryString(req, 'search'),
        page: getQueryNumber(req, 'page'),
        limit: getQueryNumber(req, 'limit'),
      });
      sendPaginatedWithETag(req, res, result, t);
    }),
  );

  /**
   * GET /api/v1/missions/:uuid
   * Single mission by UUID
   */
  router.get(
    '/api/v1/missions/:uuid',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = getQueryString(req, 'env') ?? 'live';
      const mission = await gameDataService!.missions.getMissionByUuid(req.params.uuid, env);
      if (!mission) return void res.status(404).json({ success: false, error: 'Mission not found' });
      sendDataWithETag(req, res, mission);
    }),
  );
}
