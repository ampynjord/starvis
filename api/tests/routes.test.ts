/**
 * STARVIS - HTTP route integration tests (supertest)
 * Tests all API routes against a mock GameDataService / ShipMatrixService
 */

import type { PrismaLike as PrismaClient } from '@starvis/db';
import express, { type Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/middleware/auth.js', () => ({
  requireJwt: (_req: any, _res: any, next: any) => next(),
  requireJwtAdmin: (_req: any, _res: any, next: any) => next(),
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

import { mountCommodityRoutes } from '../src/routes/commodities.js';
import { healthRouter } from '../src/routes/health.js';
import { createRoutes } from '../src/routes/index.js';
import { mountLocationRoutes } from '../src/routes/locations.js';
import { mountManufacturerRoutes } from '../src/routes/manufacturers.js';
import type { RouteDependencies } from '../src/routes/types.js';

// ── Mock factory helpers ─────────────────────────────────

function fn<T = unknown>(val: T = [] as unknown as T) {
  return vi.fn().mockResolvedValue(val);
}

const paginated = { data: [], total: 0, page: 1, limit: 20, pages: 0 };

function makeGameDataService() {
  return {
    ships: {
      getAllShips: fn(paginated),
      getShipFilters: fn({}),
      searchShipsAutocomplete: fn([]),
      getRandomShip: fn(null),
      getShipManufacturers: fn([]),
      getShipByUuid: fn(null),
      getShipByClassName: fn(null),
      getVariantSummary: fn([]),
      getSimilarShips: fn([]),
      getShipVariants: fn([]),
      compareShips: fn(null),
      getAllManufacturers: fn([]),
      getManufacturerByCode: fn(null),
      getManufacturerShips: fn([]),
      getManufacturerComponents: fn([]),
      getManufacturerItems: fn([]),
    },
    components: {
      getCompatibleComponents: fn([]),
      getComponentTypes: fn([]),
      getAllComponents: fn(paginated),
      getComponentFilters: fn({}),
      resolveComponent: fn(null),
      getComponentBuyLocations: fn([]),
      getComponentShips: fn([]),
    },
    loadouts: {
      getShipLoadout: fn(null),
      getShipModules: fn([]),
      getShipPaints: fn([]),
      getShipStats: fn(null),
      getShipHardpoints: fn(null),
      calculateLoadout: fn(null),
    },
    paints: {
      getAllPaints: fn(paginated),
    },
    shops: {
      getShops: fn(paginated),
      getShopInventory: fn([]),
    },
    items: {
      getItemTypes: fn([]),
      getItemFilters: fn({}),
      getAllItems: fn(paginated),
      resolveItem: fn(null),
      getItemBuyLocations: fn([]),
    },
    commodities: {
      getAllCommodities: fn(paginated),
      getCommodityByUuid: fn(null),
      getCommodityTypes: fn({ types: [] }),
    },
    mining: {
      getAllElements: fn([]),
      getElementById: fn(null),
      getAllCompositions: fn([]),
      getCompositionByUuid: fn(null),
      solveForElement: fn(null),
      solveForComposition: fn(null),
      getStats: fn({}),
      getMiningLasers: fn([]),
    },
    missions: {
      getMissionTypes: fn([]),
      getFactions: fn([]),
      getSystems: fn([]),
      getCategories: fn([]),
      getMissions: fn(paginated),
      getMissionByUuid: fn(null),
    },
    trade: {
      getTradeLocations: fn([]),
      getCommodityPrices: fn([]),
      getLocationPrices: fn([]),
      reportPrice: fn({ success: true }),
      getTradeSystems: fn([]),
      findBestRoutes: fn([]),
    },
    crafting: {
      getCategories: fn([]),
      getStationTypes: fn([]),
      getRecipes: fn(paginated),
      getResources: fn([]),
      getRecipesByResource: fn([]),
      getRecipeByUuid: fn(null),
    },
    locations: {
      getLocationTypes: fn([]),
      getLocationSystems: fn([]),
      getAll: fn([]),
      getLocations: fn(paginated),
      getLocation: fn(null),
      getLocationChildren: fn([]),
    },
    unifiedSearch: fn({ ships: [], components: [], items: [], commodities: [], missions: [], recipes: [] }),
    getChangelogSummary: fn([]),
    getChangelog: fn({ data: [], total: 0, page: 1, limit: 20, pages: 0 }),
    getPublicStats: fn({}),
    getLatestExtraction: fn(null),
    getStats: fn({}),
    getExtractionLog: fn([]),
  };
}

function makeShipMatrixService() {
  return {
    getStats: fn({ total: 0 }),
    getAll: fn([]),
    search: fn([]),
    getById: fn(null),
    getByName: fn(null),
    sync: fn({ synced: 0 }),
  };
}

function makePrisma() {
  return {
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  } as unknown as PrismaClient;
}

// ── App setup ────────────────────────────────────────────

let app: Express;
let gds: ReturnType<typeof makeGameDataService>;

beforeAll(() => {
  gds = makeGameDataService();
  const deps: RouteDependencies = {
    prisma: makePrisma(),
    shipMatrixService: makeShipMatrixService() as any,
    gameDataService: gds as any,
  };
  app = express();
  app.use(express.json());
  app.use('/health', healthRouter);
  app.use('/', createRoutes(deps));
});

// ── Health ───────────────────────────────────────────────

describe('GET /health/live', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
  });
});

describe('GET /health/ready', () => {
  it('returns 200 or 503 depending on DB', async () => {
    const res = await request(app).get('/health/ready');
    expect([200, 503]).toContain(res.status);
  });
});

// ── Ship Matrix ──────────────────────────────────────────

describe('GET /api/v1/ship-matrix', () => {
  it('returns 200 with data array', async () => {
    const res = await request(app).get('/api/v1/ship-matrix');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/ship-matrix/stats', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/ship-matrix/stats');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/ship-matrix/:id (not found)', () => {
  it('returns 404', async () => {
    const res = await request(app).get('/api/v1/ship-matrix/invalid-id');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ── Ships ────────────────────────────────────────────────

describe('GET /api/v1/ships', () => {
  it('returns 200 with paginated result', async () => {
    gds.ships.getAllShips.mockResolvedValueOnce({ data: [{ uuid: 's1', name: 'Aurora MR' }], total: 1, page: 1, limit: 20, pages: 1 });
    const res = await request(app).get('/api/v1/ships');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.total).toBe(1);
  });
});

describe('GET /api/v1/ships/filters', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/ships/filters');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/ships/ranking', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/ships/ranking');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/ships/search', () => {
  it('returns 400 when search param is missing', async () => {
    const res = await request(app).get('/api/v1/ships/search');
    expect(res.status).toBe(400);
  });

  it('returns 200 when search is provided', async () => {
    const res = await request(app).get('/api/v1/ships/search?search=aurora');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/ships/random', () => {
  it('returns 404 when no ship returned', async () => {
    const res = await request(app).get('/api/v1/ships/random');
    expect(res.status).toBe(404);
  });

  it('returns 200 when ship is found', async () => {
    gds.ships.getRandomShip.mockResolvedValueOnce({ uuid: 'r1', name: 'Random Ship' });
    const res = await request(app).get('/api/v1/ships/random');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/ships/manufacturers', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/ships/manufacturers');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/ships/:uuid (not found)', () => {
  it('returns 404', async () => {
    const res = await request(app).get('/api/v1/ships/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/v1/ships/:uuid/similar', () => {
  it('returns 200 with similar ships', async () => {
    const res = await request(app).get('/api/v1/ships/00000000-0000-0000-0000-000000000000/similar');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/ships/:uuid/variants', () => {
  it('returns 200 with variants', async () => {
    const res = await request(app).get('/api/v1/ships/00000000-0000-0000-0000-000000000000/variants');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── Manufacturers ────────────────────────────────────────

describe('GET /api/v1/manufacturers', () => {
  it('returns 200 with data array', async () => {
    gds.ships.getAllManufacturers.mockResolvedValueOnce([
      { code: 'ANVL', name: 'Anvil Aerospace', ship_count: 10, component_count: 5, item_count: 3 },
    ]);
    const res = await request(app).get('/api/v1/manufacturers');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
  });
});

describe('GET /api/v1/manufacturers/:code (not found)', () => {
  it('returns 404', async () => {
    const res = await request(app).get('/api/v1/manufacturers/UNKNOWN');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/v1/manufacturers/:code (found)', () => {
  it('returns 200', async () => {
    gds.ships.getManufacturerByCode.mockResolvedValueOnce({ code: 'RSI', name: 'Roberts Space Industries' });
    const res = await request(app).get('/api/v1/manufacturers/RSI');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.code).toBe('RSI');
  });
});

describe('GET /api/v1/manufacturers/:code/ships', () => {
  it('returns 404 when manufacturer not found', async () => {
    const res = await request(app).get('/api/v1/manufacturers/UNKNOWN/ships');
    expect(res.status).toBe(404);
  });

  it('returns 200 with ships when manufacturer found', async () => {
    gds.ships.getManufacturerByCode.mockResolvedValueOnce({ code: 'ANVL', name: 'Anvil Aerospace' });
    gds.ships.getManufacturerShips.mockResolvedValueOnce([{ uuid: 's1', name: 'Hornet' }]);
    const res = await request(app).get('/api/v1/manufacturers/ANVL/ships');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });
});

describe('GET /api/v1/manufacturers/:code/components', () => {
  it('returns 404 when manufacturer not found', async () => {
    const res = await request(app).get('/api/v1/manufacturers/UNKNOWN/components');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/manufacturers/:code/items', () => {
  it('returns 404 when manufacturer not found', async () => {
    const res = await request(app).get('/api/v1/manufacturers/UNKNOWN/items');
    expect(res.status).toBe(404);
  });
});

// ── Components ───────────────────────────────────────────

describe('GET /api/v1/components', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/components');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/components/types', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/components/types');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/components/filters', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/components/filters');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/components/:uuid (not found)', () => {
  it('returns 404', async () => {
    const res = await request(app).get('/api/v1/components/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ── Items ────────────────────────────────────────────────

describe('GET /api/v1/items', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/items');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/items/types', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/items/types');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/items/filters', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/items/filters');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/items/:uuid (not found)', () => {
  it('returns 404', async () => {
    const res = await request(app).get('/api/v1/items/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ── Commodities ───────────────────────────────────────────

describe('GET /api/v1/commodities', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/commodities');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/commodities/types', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/commodities/types');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/commodities/:uuid (not found)', () => {
  it('returns 404', async () => {
    const res = await request(app).get('/api/v1/commodities/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ── Paints ───────────────────────────────────────────────

describe('GET /api/v1/paints', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/paints');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── Shops ────────────────────────────────────────────────

describe('GET /api/v1/shops', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/shops');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/shops/:id/inventory', () => {
  it('returns 400 when id is not numeric', async () => {
    const res = await request(app).get('/api/v1/shops/not-a-number/inventory');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 200 when id is numeric', async () => {
    const res = await request(app).get('/api/v1/shops/1/inventory');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── Mining ───────────────────────────────────────────────

describe('GET /api/v1/mining/elements', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/mining/elements');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/mining/elements/:uuid (not found)', () => {
  it('returns 404', async () => {
    const res = await request(app).get('/api/v1/mining/elements/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/v1/mining/compositions', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/mining/compositions');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/mining/stats', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/mining/stats');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── Missions ─────────────────────────────────────────────

describe('GET /api/v1/missions/types', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/missions/types');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/missions', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/missions');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/missions/:uuid (not found)', () => {
  it('returns 404', async () => {
    const res = await request(app).get('/api/v1/missions/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ── Locations ─────────────────────────────────────────────

describe('GET /api/v1/locations/types', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/locations/types');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/locations/systems', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/locations/systems');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/locations/all', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/locations/all');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/locations', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/locations');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/locations/:uuid (not found)', () => {
  it('returns 404', async () => {
    const res = await request(app).get('/api/v1/locations/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/v1/locations/:uuid/children', () => {
  it('returns 200 even when parent not found', async () => {
    const res = await request(app).get('/api/v1/locations/00000000-0000-0000-0000-000000000000/children');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── Trade ─────────────────────────────────────────────────

describe('GET /api/v1/trade/locations', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/trade/locations');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/trade/systems', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/trade/systems');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/trade/prices/:commodityUuid', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/trade/prices/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── Crafting ──────────────────────────────────────────────

describe('GET /api/v1/crafting/categories', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/crafting/categories');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/crafting/recipes', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/crafting/recipes');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/crafting/resources', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/crafting/resources');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── Search ────────────────────────────────────────────────

describe('GET /api/v1/search', () => {
  it('returns 400 when search param is missing', async () => {
    const res = await request(app).get('/api/v1/search');
    expect(res.status).toBe(400);
  });

  it('returns 200 with all categories when search is provided', async () => {
    const res = await request(app).get('/api/v1/search?search=aurora');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── System ────────────────────────────────────────────────

describe('GET /api/v1/version', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/version');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/changelog', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/changelog');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/changelog/summary', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/changelog/summary');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/stats/overview', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/v1/stats/overview');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── 503 when game data unavailable ───────────────────────
// Note: routes that call makeShipResolver() at mount time (ships.ts, search.ts)
// require at least a gameDataService.ships stub — they are excluded here.

describe('503 when gameDataService is unavailable', () => {
  let appWithoutGds: Express;

  beforeAll(() => {
    // Provide a minimal stub just for mount-time calls, but flag as unavailable
    // via a falsy-equivalent wrapper so the guard still rejects requests.
    // Routes that don't use makeShipResolver at mount time return 503 cleanly.
    const minimalShips = {
      getShipByUuid: vi.fn(),
      getShipByClassName: vi.fn(),
    };
    const _stubGds = { ships: minimalShips } as any;
    // Wrap in a Proxy so the guard treats it as unavailable
    // The guard does: if (!gameDataService) → 503
    // We achieve 503 by passing undefined, but only for routes that don't crash
    const depsNoGds: RouteDependencies = {
      prisma: makePrisma(),
      shipMatrixService: makeShipMatrixService() as any,
      // Pass a stub that satisfies mount-time calls but guard still triggers 503
      // We achieve this by making a fresh mock with undefined gameDataService...
      // but ships.ts needs ships at mount time. We test only non-ship routes here.
      gameDataService: undefined,
    };

    // Build a router only with non-ship routes to test 503 behavior
    const router = express.Router();
    mountManufacturerRoutes(router, depsNoGds);
    mountLocationRoutes(router, depsNoGds);
    mountCommodityRoutes(router, depsNoGds);

    appWithoutGds = express();
    appWithoutGds.use(express.json());
    appWithoutGds.use('/', router);
  });

  it('GET /api/v1/manufacturers returns 503', async () => {
    const res = await request(appWithoutGds).get('/api/v1/manufacturers');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/v1/locations returns 503', async () => {
    const res = await request(appWithoutGds).get('/api/v1/locations');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/v1/commodities returns 503', async () => {
    const res = await request(appWithoutGds).get('/api/v1/commodities');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });
});

// ── RSI Website routes ───────────────────────────────────

function makeRsiWebsiteService() {
  return {
    getGalactapediaEntries: fn({ data: [], total: 0, page: 1, limit: 20, pages: 0 }),
    getGalactapediaEntry: fn(null),
    getCommLinks: fn({ data: [], total: 0, page: 1, limit: 20, pages: 0 }),
    getCommLink: fn(null),
    getCommLinkCategories: fn([]),
    getStarmapSystems: fn({ data: [], total: 0, page: 1, limit: 20, pages: 0 }),
    getStarmapSystem: fn(null),
  };
}

describe('RSI website routes', () => {
  let rsiApp: Express;

  beforeAll(() => {
    const deps: RouteDependencies = {
      prisma: makePrisma(),
      shipMatrixService: makeShipMatrixService() as any,
      gameDataService: makeGameDataService() as any,
      rsiWebsiteService: makeRsiWebsiteService() as any,
    };
    rsiApp = express();
    rsiApp.use(express.json());
    rsiApp.use('/', createRoutes(deps));
  });

  it('GET /api/v1/galactapedia returns 200', async () => {
    const res = await request(rsiApp).get('/api/v1/galactapedia');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/v1/galactapedia/:id returns 404 when not found', async () => {
    const res = await request(rsiApp).get('/api/v1/galactapedia/unknown-id');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/v1/comm-links/categories returns 200', async () => {
    const res = await request(rsiApp).get('/api/v1/comm-links/categories');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/v1/comm-links returns 200', async () => {
    const res = await request(rsiApp).get('/api/v1/comm-links');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/v1/comm-links/:id returns 404 when not found', async () => {
    const res = await request(rsiApp).get('/api/v1/comm-links/99999');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/v1/starmap/systems returns 200', async () => {
    const res = await request(rsiApp).get('/api/v1/starmap/systems');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/v1/starmap/systems/:code returns 404 when not found', async () => {
    const res = await request(rsiApp).get('/api/v1/starmap/systems/UNKNOWN');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
