import type { Router } from 'express';
import { LoadoutBody, SearchQuery } from '../schemas.js';
import { asyncHandler, makeGameDataGuard, makeShipResolver, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountSearchRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);
  const { resolveShipUuid } = makeShipResolver(gameDataService!.ships);

  router.get(
    '/api/v1/search',
    requireGameData,
    asyncHandler(async (req, res) => {
      const { search } = SearchQuery.parse(req.query);
      if (!search || search.length < 2)
        return void res.status(400).json({ success: false, error: "Query 'search' must be at least 2 characters" });
      const limit = parseInt(String(req.query.limit ?? '10'), 10) || 10;
      const data = await gameDataService!.unifiedSearch(search, limit);
      sendWithETag(req, res, {
        success: true,
        data,
        total: data.ships.length + data.components.length + data.items.length,
      });
    }),
  );

  router.post(
    '/api/v1/loadout/calculate',
    requireGameData,
    asyncHandler(async (req, res) => {
      const { shipUuid, swaps } = LoadoutBody.parse(req.body);
      const uuid = await resolveShipUuid(shipUuid);
      if (!uuid) return void res.status(404).json({ success: false, error: 'Ship not found' });
      const result = await gameDataService!.loadouts.calculateLoadout(uuid, swaps);
      res.json({ success: true, data: result });
    }),
  );
}
