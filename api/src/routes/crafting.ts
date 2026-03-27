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

export function mountCraftingRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);

  /**
   * GET /api/v1/crafting/categories
   * Lists all distinct crafting categories with count
   */
  mountEnvDataRoute(router, '/api/v1/crafting/categories', requireGameData, (env) => gameDataService!.crafting.getCategories(env));

  /**
   * GET /api/v1/crafting/station-types
   * Lists all distinct station types
   */
  mountEnvDataRoute(router, '/api/v1/crafting/station-types', requireGameData, (env) => gameDataService!.crafting.getStationTypes(env));

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
        env: getQueryString(req, 'env'),
        category: getQueryString(req, 'category'),
        search: getQueryString(req, 'search'),
        page: getQueryNumber(req, 'page'),
        limit: getQueryNumber(req, 'limit'),
        skillLevel: getQueryNumber(req, 'skillLevel'),
        stationType: getQueryString(req, 'stationType'),
      });
      sendPaginatedWithETag(req, res, result, t);
    }),
  );

  /**
   * GET /api/v1/crafting/resources
   * Lists all distinct crafting resources with usage counts
   */
  mountEnvDataRoute(router, '/api/v1/crafting/resources', requireGameData, (env) => gameDataService!.crafting.getResources(env));

  /**
   * GET /api/v1/crafting/resources/:itemName/recipes
   * Lists all recipes using a given resource
   */
  router.get(
    '/api/v1/crafting/resources/:itemName/recipes',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = getQueryString(req, 'env') ?? 'live';
      const recipes = await gameDataService!.crafting.getRecipesByResource(req.params.itemName, env);
      sendDataWithETag(req, res, recipes, recipes.length);
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
      const env = getQueryString(req, 'env') ?? 'live';
      const recipe = await gameDataService!.crafting.getRecipeByUuid(req.params.uuid, env);
      if (!recipe) return void res.status(404).json({ success: false, error: 'Recipe not found' });
      sendDataWithETag(req, res, recipe);
    }),
  );
}
