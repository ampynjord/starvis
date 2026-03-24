import type { Router } from 'express';
import { asyncHandler, makeGameDataGuard, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountMissionRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);

  /**
   * GET /api/v1/missions/types
   * Lists all distinct mission types
   */
  router.get(
    '/api/v1/missions/types',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const types = await gameDataService!.missions.getMissionTypes(env);
      sendWithETag(req, res, { success: true, data: types });
    }),
  );

  /**
   * GET /api/v1/missions/factions
   * Lists all distinct factions
   */
  router.get(
    '/api/v1/missions/factions',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const factions = await gameDataService!.missions.getFactions(env);
      sendWithETag(req, res, { success: true, data: factions });
    }),
  );

  /**
   * GET /api/v1/missions/systems
   * Lists all distinct mission location systems
   */
  router.get(
    '/api/v1/missions/systems',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const systems = await gameDataService!.missions.getSystems(env);
      sendWithETag(req, res, { success: true, data: systems });
    }),
  );

  /**
   * GET /api/v1/missions
   * Paginated mission list with optional filters:
   *   env, type, legal, shared, faction, system, minReward, search, page, limit
   */
  router.get(
    '/api/v1/missions',
    requireGameData,
    asyncHandler(async (req, res) => {
      const t = Date.now();
      const result = await gameDataService!.missions.getMissions({
        env: req.query.env ? String(req.query.env) : undefined,
        type: req.query.type ? String(req.query.type) : undefined,
        legal: req.query.legal ? String(req.query.legal) : undefined,
        shared: req.query.shared ? String(req.query.shared) : undefined,
        faction: req.query.faction ? String(req.query.faction) : undefined,
        system: req.query.system ? String(req.query.system) : undefined,
        minReward: req.query.minReward ? Number(req.query.minReward) : undefined,
        search: req.query.search ? String(req.query.search) : undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      sendWithETag(req, res, {
        success: true,
        count: result.data.length,
        total: result.total,
        page: result.page,
        limit: result.limit,
        pages: result.pages,
        data: result.data,
        meta: { responseTime: `${Date.now() - t}ms` },
      });
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
      const env = String(req.query.env ?? 'live');
      const mission = await gameDataService!.missions.getMissionByUuid(req.params.uuid, env);
      if (!mission) return void res.status(404).json({ success: false, error: 'Mission not found' });
      sendWithETag(req, res, { success: true, data: mission });
    }),
  );
}
