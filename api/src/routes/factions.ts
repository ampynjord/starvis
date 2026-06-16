import type { Router } from 'express';
import {
  asyncHandler,
  getQueryEnv,
  getQueryNumber,
  getQueryString,
  makeGameDataGuard,
  sendDataWithETag,
  sendWithETag,
} from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountFactionRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);

  /**
   * GET /api/v1/factions
   * Summary list of all game factions with key attributes.
   */
  router.get(
    '/api/v1/factions',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = getQueryEnv(req);
      const data = await gameDataService!.missions.getFactionDetails(env);
      sendDataWithETag(req, res, data, data.length);
    }),
  );

  /**
   * GET /api/v1/factions/registry
   * Paginated registry of all game factions with full attributes.
   * Query: env, search, page, limit
   */
  router.get(
    '/api/v1/factions/registry',
    requireGameData,
    asyncHandler(async (req, res) => {
      const t = Date.now();
      const result = await gameDataService!.missions.getFactionRegistry({
        env: getQueryEnv(req),
        search: getQueryString(req, 'search'),
        page: getQueryNumber(req, 'page'),
        limit: getQueryNumber(req, 'limit'),
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
   * GET /api/v1/factions/reputation-standings
   * Paginated list of reputation standing tiers (Hostile → Ally).
   * Query: env, search, page, limit
   */
  router.get(
    '/api/v1/factions/reputation-standings',
    requireGameData,
    asyncHandler(async (req, res) => {
      const t = Date.now();
      const result = await gameDataService!.missions.getReputationStandings({
        env: getQueryEnv(req),
        search: getQueryString(req, 'search'),
        page: getQueryNumber(req, 'page'),
        limit: getQueryNumber(req, 'limit'),
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
   * GET /api/v1/factions/reputation-scopes
   * Paginated list of reputation scopes (faction-specific reputation tracks).
   * Query: env, search, page, limit
   */
  router.get(
    '/api/v1/factions/reputation-scopes',
    requireGameData,
    asyncHandler(async (req, res) => {
      const t = Date.now();
      const result = await gameDataService!.missions.getReputationScopes({
        env: getQueryEnv(req),
        search: getQueryString(req, 'search'),
        page: getQueryNumber(req, 'page'),
        limit: getQueryNumber(req, 'limit'),
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
   * GET /api/v1/factions/:faction
   * Single faction by class name or UUID.
   */
  router.get(
    '/api/v1/factions/:faction',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = getQueryEnv(req);
      const data = await gameDataService!.missions.getFactionDetail(req.params.faction, env);
      if (!data) return void res.status(404).json({ success: false, error: 'Faction not found' });
      sendDataWithETag(req, res, data);
    }),
  );
}
