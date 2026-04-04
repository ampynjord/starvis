import type { Router } from 'express';
import {
  asyncHandler,
  getQueryNumber,
  getQueryString,
  makeGameDataGuard,
  mountEnvDataRoute,
  sendDataWithETag,
  sendPaginatedWithETag,
  sendWithETag,
} from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountLocationRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);

  /** GET /api/v1/locations/types */
  mountEnvDataRoute(router, '/api/v1/locations/types', requireGameData, (env) => gameDataService!.locations.getLocationTypes(env));

  /** GET /api/v1/locations/systems */
  mountEnvDataRoute(router, '/api/v1/locations/systems', requireGameData, (env) => gameDataService!.locations.getLocationSystems(env));

  /** GET /api/v1/locations/all — full unpaginated list for tree views */
  router.get(
    '/api/v1/locations/all',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = getQueryString(req, 'env') ?? 'live';
      const data = await gameDataService!.locations.getAll(env);
      sendDataWithETag(req, res, data, data.length);
    }),
  );

  /** GET /api/v1/locations */
  router.get(
    '/api/v1/locations',
    requireGameData,
    asyncHandler(async (req, res) => {
      const t = Date.now();
      const result = await gameDataService!.locations.getLocations({
        env: getQueryString(req, 'env'),
        type: getQueryString(req, 'type'),
        types: getQueryString(req, 'types'),
        system: getQueryString(req, 'system'),
        search: getQueryString(req, 'search'),
        hideInStarmap: getQueryString(req, 'hideInStarmap'),
        sort: getQueryString(req, 'sort'),
        order: getQueryString(req, 'order'),
        page: getQueryNumber(req, 'page'),
        limit: getQueryNumber(req, 'limit'),
      });
      sendPaginatedWithETag(req, res, result, t);
    }),
  );

  /** GET /api/v1/locations/:uuid */
  router.get(
    '/api/v1/locations/:uuid',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = getQueryString(req, 'env') ?? 'live';
      const loc = await gameDataService!.locations.getLocation(req.params.uuid, env);
      if (!loc) return void res.status(404).json({ success: false, error: 'Location not found' });
      sendWithETag(req, res, { success: true, data: loc });
    }),
  );

  /** GET /api/v1/locations/:uuid/children */
  router.get(
    '/api/v1/locations/:uuid/children',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = getQueryString(req, 'env') ?? 'live';
      const data = await gameDataService!.locations.getLocationChildren(req.params.uuid, env);
      sendDataWithETag(req, res, data, data.length);
    }),
  );
}
