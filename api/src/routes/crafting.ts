import type { Router } from 'express';
import { asyncHandler, makeGameDataGuard, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountCraftingRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);

  /**
   * GET /api/v1/crafting/categories
   * Lists all distinct crafting categories with count
   */
  router.get(
    '/api/v1/crafting/categories',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const categories = await gameDataService!.crafting.getCategories(env);
      sendWithETag(req, res, { success: true, data: categories });
    }),
  );

  /**
   * GET /api/v1/crafting/station-types
   * Lists all distinct station types
   */
  router.get(
    '/api/v1/crafting/station-types',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const types = await gameDataService!.crafting.getStationTypes(env);
      sendWithETag(req, res, { success: true, data: types });
    }),
  );

  /**
   * GET /api/v1/crafting/recipes
   * Paginated recipe list with optional filters:
   *   env, category, search, page, limit, skillLevel, stationType
   */
  router.get(
    '/api/v1/crafting/recipes',
    requireGameData,
    asyncHandler(async (req, res) => {
      const t = Date.now();
      const result = await gameDataService!.crafting.getRecipes({
        env: req.query.env ? String(req.query.env) : undefined,
        category: req.query.category ? String(req.query.category) : undefined,
        search: req.query.search ? String(req.query.search) : undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        skillLevel: req.query.skillLevel ? Number(req.query.skillLevel) : undefined,
        stationType: req.query.stationType ? String(req.query.stationType) : undefined,
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
   * GET /api/v1/crafting/resources
   * Lists all distinct crafting resources with usage counts
   */
  router.get(
    '/api/v1/crafting/resources',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const resources = await gameDataService!.crafting.getResources(env);
      sendWithETag(req, res, { success: true, data: resources });
    }),
  );

  /**
   * GET /api/v1/crafting/resources/:itemName/recipes
   * Lists all recipes using a given resource
   */
  router.get(
    '/api/v1/crafting/resources/:itemName/recipes',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const recipes = await gameDataService!.crafting.getRecipesByResource(req.params.itemName, env);
      sendWithETag(req, res, { success: true, data: recipes, count: recipes.length });
    }),
  );

  /**
   * GET /api/v1/crafting/recipes/:uuid
   * Single recipe by UUID with ingredients
   */
  router.get(
    '/api/v1/crafting/recipes/:uuid',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const recipe = await gameDataService!.crafting.getRecipeByUuid(req.params.uuid, env);
      if (!recipe) return void res.status(404).json({ success: false, error: 'Recipe not found' });
      sendWithETag(req, res, { success: true, data: recipe });
    }),
  );
}
