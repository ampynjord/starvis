import type { Router } from 'express';
import { UniverseNexusService } from '../services/universe-nexus-service.js';
import { asyncHandler, getQueryString, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountUniverseNexusRoutes(router: Router, deps: RouteDependencies): void {
  const nexusService = new UniverseNexusService(deps.prisma);

  /**
   * GET /api/v2/universe/omni-search
   * Fast multi-domain global search traversing ships, components, items, locations, commodities.
   * Strips all placeholders, unreleased dev entities, and technical prefixes.
   */
  router.get(
    '/api/v2/universe/omni-search',
    asyncHandler(async (req, res) => {
      const q = getQueryString(req, 'q') ?? getQueryString(req, 'search') ?? '';
      const env = getQueryString(req, 'env') ?? 'live';
      const limit = Number(req.query.limit ?? 20);

      const results = await nexusService.omniSearch(q, env, limit);
      sendWithETag(req, res, {
        success: true,
        data: results,
        count: results.length,
      });
    }),
  );

  /**
   * GET /api/v2/universe/explore
   * Unified pagination & intelligent facets across the universe categories.
   */
  router.get(
    '/api/v2/universe/explore',
    asyncHandler(async (req, res) => {
      const category = (getQueryString(req, 'category') as any) ?? 'all';
      const search = getQueryString(req, 'search');
      const manufacturer = getQueryString(req, 'manufacturer');
      const type = getQueryString(req, 'type');
      const system = getQueryString(req, 'system');
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 24);
      const env = getQueryString(req, 'env') ?? 'live';

      const result = await nexusService.explore({
        category,
        search,
        manufacturer,
        type,
        system,
        page,
        limit,
        env,
      });

      sendWithETag(req, res, {
        success: true,
        ...result,
      });
    }),
  );

  /**
   * GET /api/v2/universe/entities/:category/:id
   * Complete 360° Pivot Nexus Sheet with relational graph connections.
   */
  router.get(
    '/api/v2/universe/entities/:category/:id',
    asyncHandler(async (req, res) => {
      const category = req.params.category as any;
      const id = req.params.id;
      const env = getQueryString(req, 'env') ?? 'live';

      if (!['ships', 'components', 'items', 'locations', 'commodities'].includes(category)) {
        res.status(400).json({ success: false, error: 'Invalid category' });
        return;
      }

      const result = await nexusService.getEntityNexus(category, id, env);
      if (!result) {
        res.status(404).json({ success: false, error: 'Entity not found in universe' });
        return;
      }

      sendWithETag(req, res, {
        success: true,
        data: result,
      });
    }),
  );
}
