import type { Router } from 'express';
import { UniverseNexusService } from '../services/universe-nexus-service.js';
import { asyncHandler, getQueryString, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountUniverseNexusRoutes(router: Router, deps: RouteDependencies): void {
  const nexusService = new UniverseNexusService(deps.prisma);

  /**
   * GET /api/universe/omni-search
   * Alias de compatibilité : /api/v2/universe/omni-search (même gestionnaire).
   */
  router.get(
    ['/api/universe/omni-search', '/api/v2/universe/omni-search'],
    asyncHandler(async (req, res) => {
      const q = getQueryString(req, 'q') ?? getQueryString(req, 'search') ?? '';
      const env = getQueryString(req, 'env') ?? 'live';
      const lang = getQueryString(req, 'lang') ?? 'fr';
      const limit = Number(req.query.limit ?? 20);

      const results = await nexusService.omniSearch(q, env, limit, lang);
      sendWithETag(req, res, {
        success: true,
        data: results,
        count: results.length,
      });
    }),
  );

  /**
   * GET /api/universe/taxonomy
   * Alias de compatibilité : /api/v2/universe/taxonomy (même gestionnaire).
   */
  router.get(
    ['/api/universe/taxonomy', '/api/v2/universe/taxonomy'],
    asyncHandler(async (req, res) => {
      const env = getQueryString(req, 'env') ?? 'live';
      const taxonomy = await nexusService.getTaxonomy(env);
      sendWithETag(req, res, {
        success: true,
        data: taxonomy,
      });
    }),
  );

  /**
   * GET /api/universe/explore
   * Alias de compatibilité : /api/v2/universe/explore (même gestionnaire).
   */
  router.get(
    ['/api/universe/explore', '/api/v2/universe/explore'],
    asyncHandler(async (req, res) => {
      const category = (getQueryString(req, 'category') as any) ?? 'all';
      const subCategory = getQueryString(req, 'sub_category') ?? getQueryString(req, 'subCategory');
      const search = getQueryString(req, 'search');
      const manufacturer = getQueryString(req, 'manufacturer');
      const type = getQueryString(req, 'type');
      const system = getQueryString(req, 'system');
      const status = getQueryString(req, 'status');
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 24);
      const env = getQueryString(req, 'env') ?? 'live';
      const lang = getQueryString(req, 'lang') ?? 'fr';

      const result = await nexusService.explore({
        category,
        subCategory,
        search,
        manufacturer,
        type,
        system,
        status,
        page,
        limit,
        env,
        lang,
      });

      sendWithETag(req, res, {
        success: true,
        ...result,
      });
    }),
  );

  /**
   * GET /api/universe/entities/:category/:id
   * Alias de compatibilité : /api/v2/universe/entities/:category/:id (même gestionnaire).
   */
  router.get(
    ['/api/universe/entities/:category/:id', '/api/v2/universe/entities/:category/:id'],
    asyncHandler(async (req, res) => {
      const category = req.params.category as any;
      const id = req.params.id;
      const env = getQueryString(req, 'env') ?? 'live';
      const lang = getQueryString(req, 'lang') ?? 'fr';

      const validCategories = [
        'ships',
        'fleet',
        'components',
        'vehicles',
        'items',
        'armor',
        'clothing',
        'weapons',
        'utility',
        'ammo',
        'sustenance',
        'locations',
        'commodities',
      ];

      if (!validCategories.includes(String(category).toLowerCase())) {
        res.status(400).json({ success: false, error: 'Invalid category' });
        return;
      }

      const result = await nexusService.getEntityNexus(category, id, env, lang);
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
