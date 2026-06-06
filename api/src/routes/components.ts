import type { Router } from 'express';
import { ComponentQuery } from '../schemas.js';
import {
  GAME_COMPONENT_CATEGORIES,
  GAME_COMPONENT_CATEGORY_TYPES,
  getGameComponentCategoryTypes,
  slugifyGameComponentCategory,
} from '../services/component-taxonomy.js';
import { asyncHandler, makeGameDataGuard, sendCsvOrJson, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

/** Backward-compatible category aliases used by older clients. */
const LEGACY_COMPONENT_CATEGORY_TYPES: Record<string, string[]> = {
  weapons: ['WeaponGun', 'Turret', 'TurretUnmanned', 'MissileRack', 'Missile', 'EMP', 'QuantumInterdictionGenerator'],
  systems: [
    'Shield',
    'PowerPlant',
    'Cooler',
    'QuantumDrive',
    'JumpModule',
    'Thruster',
    'FuelIntake',
    'FuelTank',
    'Radar',
    'Countermeasure',
    'LifeSupport',
  ],
  mounts: ['Gimbal'],
  utility: ['MiningLaser', 'MiningArm', 'MiningModifier', 'SalvageHead', 'TractorBeam', 'RepairBeam'],
  modules: ['ShipModule'],
};

function resolveComponentCategoryTypes(category: string): string[] | undefined {
  return getGameComponentCategoryTypes(category) ?? LEGACY_COMPONENT_CATEGORY_TYPES[category];
}

export function mountComponentRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);

  router.get(
    '/api/v1/components/compatible',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const type = String(req.query.type ?? '');
      const min_size = req.query.min_size != null ? parseInt(String(req.query.min_size), 10) : undefined;
      const max_size = req.query.max_size != null ? parseInt(String(req.query.max_size), 10) : undefined;
      const search = String(req.query.search ?? '');
      const sort = String(req.query.sort ?? 'size');
      const order = String(req.query.order ?? 'asc');
      const limit = Math.min(200, parseInt(String(req.query.limit ?? '100'), 10) || 100);
      const data = await gameDataService!.components.getCompatibleComponents({
        env,
        type: type || undefined,
        min_size,
        max_size,
        search: search || undefined,
        sort,
        order,
        limit,
      });
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );

  router.get(
    '/api/v1/components/types',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const data = await gameDataService!.components.getComponentTypes(env);
      sendWithETag(req, res, { success: true, data });
    }),
  );

  router.get(
    '/api/v1/components/categories',
    requireGameData,
    asyncHandler(async (_req, res) => {
      const data = GAME_COMPONENT_CATEGORIES.map((category) => ({
        slug: slugifyGameComponentCategory(category),
        label: category,
        types: GAME_COMPONENT_CATEGORY_TYPES[category],
      }));
      sendWithETag(_req, res, { success: true, data });
    }),
  );

  router.get(
    '/api/v1/components',
    requireGameData,
    asyncHandler(async (req, res) => {
      const t = Date.now();
      // ?category= maps to a predefined type list; overrides individual ?type= param
      const categoryParam = req.query.category ? String(req.query.category) : undefined;
      const categoryTypes = categoryParam ? resolveComponentCategoryTypes(categoryParam) : undefined;
      if (categoryParam && !categoryTypes) {
        return void res.status(400).json({ success: false, error: `Invalid category: ${categoryParam}` });
      }
      const queryWithCategory = categoryTypes ? { ...req.query, type: undefined } : req.query;
      const filters = ComponentQuery.parse(queryWithCategory);
      if (categoryTypes && !filters.types) {
        // Inject the multi-type list directly into the service call
        (filters as Record<string, unknown>).types = categoryTypes;
      }
      const result = await gameDataService!.components.getAllComponents(filters);
      const payload = {
        success: true,
        count: result.data.length,
        total: result.total,
        page: result.page,
        limit: result.limit,
        pages: result.pages,
        data: result.data,
        meta: { source: 'Game Data', responseTime: `${Date.now() - t}ms` },
      };
      if (req.query.format === 'csv') return void sendCsvOrJson(req, res, result.data as Record<string, unknown>[], payload);
      sendWithETag(req, res, payload);
    }),
  );

  router.get(
    '/api/v1/components/filters',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const result = await gameDataService!.components.getComponentFilters(env);
      sendWithETag(req, res, { success: true, ...result });
    }),
  );

  router.get(
    '/api/v1/components/:uuid',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const comp = await gameDataService!.components.resolveComponent(req.params.uuid, env);
      if (!comp) return void res.status(404).json({ success: false, error: 'Component not found' });
      sendWithETag(req, res, { success: true, data: comp });
    }),
  );

  router.get(
    '/api/v1/components/:uuid/buy-locations',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const comp = await gameDataService!.components.resolveComponent(req.params.uuid, env);
      if (!comp) return void res.status(404).json({ success: false, error: 'Component not found' });
      const data = await gameDataService!.components.getComponentBuyLocations(comp, env);
      if (req.query.format === 'csv')
        return void sendCsvOrJson(req, res, data as Record<string, unknown>[], { success: true, count: data.length, data });
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );

  router.get(
    '/api/v1/components/:uuid/ships',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const comp = await gameDataService!.components.resolveComponent(req.params.uuid, env);
      if (!comp) return void res.status(404).json({ success: false, error: 'Component not found' });
      const data = await gameDataService!.components.getComponentShips(comp, env);
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );
}
