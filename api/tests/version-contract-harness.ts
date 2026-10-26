/**
 * Harnais partagé du contrat HTTP v1 / v2.
 *
 * Le stimulus (mocks) est fixe. La référence est produite en exécutant le
 * code de `wip/herdr-agents`, pas celui de cette branche — voir
 * `scripts/capture-herdr-contract.mts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import express, { type Express, type RequestHandler } from 'express';
import request from 'supertest';

export interface ContractProbe {
  id: string;
  version: 'v1' | 'v2';
  path: string;
}

export const CONTRACT_PROBES: ContractProbe[] = [
  { id: 'v1-ship-matrix', version: 'v1', path: '/api/v1/ship-matrix' },
  { id: 'v1-ship-matrix-stats', version: 'v1', path: '/api/v1/ship-matrix/stats' },
  { id: 'v1-ship-matrix-missing', version: 'v1', path: '/api/v1/ship-matrix/invalid-id' },
  { id: 'v1-ships', version: 'v1', path: '/api/v1/ships' },
  { id: 'v1-ships-filters', version: 'v1', path: '/api/v1/ships/filters' },
  { id: 'v1-ships-search-missing', version: 'v1', path: '/api/v1/ships/search' },
  { id: 'v1-ships-search', version: 'v1', path: '/api/v1/ships/search?search=aurora' },
  { id: 'v1-ships-missing', version: 'v1', path: '/api/v1/ships/00000000-0000-0000-0000-000000000000' },
  { id: 'v1-components', version: 'v1', path: '/api/v1/components' },
  { id: 'v1-components-missing', version: 'v1', path: '/api/v1/components/missing-component' },
  { id: 'v1-items', version: 'v1', path: '/api/v1/items' },
  { id: 'v1-commodities', version: 'v1', path: '/api/v1/commodities' },
  { id: 'v1-shops', version: 'v1', path: '/api/v1/shops' },
  { id: 'v1-shops-bad-id', version: 'v1', path: '/api/v1/shops/not-a-number' },
  { id: 'v1-locations', version: 'v1', path: '/api/v1/locations' },
  { id: 'v1-missions', version: 'v1', path: '/api/v1/missions' },
  { id: 'v1-missions-brokers', version: 'v1', path: '/api/v1/missions/brokers' },
  { id: 'v1-factions', version: 'v1', path: '/api/v1/factions' },
  { id: 'v1-mining-elements', version: 'v1', path: '/api/v1/mining/elements' },
  { id: 'v1-crafting-categories', version: 'v1', path: '/api/v1/crafting/categories' },
  { id: 'v1-paints', version: 'v1', path: '/api/v1/paints' },
  { id: 'v1-manufacturers', version: 'v1', path: '/api/v1/manufacturers' },
  { id: 'v1-changelog', version: 'v1', path: '/api/v1/changelog' },
  { id: 'v1-changelog-summary', version: 'v1', path: '/api/v1/changelog/summary' },
  { id: 'v1-game-versions', version: 'v1', path: '/api/v1/game-versions' },
  { id: 'v1-translations', version: 'v1', path: '/api/v1/translations' },
  { id: 'v1-trade-locations', version: 'v1', path: '/api/v1/trade/locations' },
  { id: 'v1-galactapedia', version: 'v1', path: '/api/v1/galactapedia' },
  { id: 'v1-comm-links', version: 'v1', path: '/api/v1/comm-links' },
  { id: 'v1-starmap-systems', version: 'v1', path: '/api/v1/starmap/systems' },
  { id: 'v1-starmap-locations', version: 'v1', path: '/api/v1/starmap/locations' },
  { id: 'v2-taxonomy', version: 'v2', path: '/api/v2/universe/taxonomy?env=live' },
  { id: 'v2-omni-search', version: 'v2', path: '/api/v2/universe/omni-search?q=aurora&env=live&lang=fr&limit=5' },
  { id: 'v2-explore', version: 'v2', path: '/api/v2/universe/explore?category=ships&env=live&lang=fr' },
  { id: 'v2-entity-missing', version: 'v2', path: '/api/v2/universe/entities/ships/missing-ship' },
  { id: 'v2-entity-bad-category', version: 'v2', path: '/api/v2/universe/entities/not-a-category/x' },
];

export interface ContractSnapshot {
  id: string;
  version: 'v1' | 'v2';
  path: string;
  status: number;
  envelope: string[];
  fields: string[];
  body: unknown;
}

function fn<T>(val: T) {
  return async () => val;
}

const paginated = { data: [] as unknown[], total: 0, page: 1, limit: 20, pages: 0 };

export function makeContractDeps() {
  const gameDataService = {
    ships: {
      getAllShips: fn(paginated),
      getShipFilters: fn({}),
      getShipCoverageAudit: fn({ env: 'live', summary: {} }),
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
    paints: { getAllPaints: fn(paginated), getPaintFilters: fn({}) },
    shops: {
      getShops: fn(paginated),
      getShopById: fn(null),
      getShopsByLocation: fn([]),
      getShopInventory: fn([]),
      getShopFilters: fn({}),
    },
    items: {
      getItemTypes: fn([]),
      getItemFilters: fn({}),
      getAllItems: fn(paginated),
      resolveItem: fn(null),
      getItemBuyLocations: fn([]),
      getCategoryCounts: fn({}),
      getWeaponAttachmentModifiers: fn([]),
      getInventoryContainers: fn(paginated),
    },
    commodities: {
      getAllCommodities: fn(paginated),
      getCommodityByUuid: fn(null),
      getCommodityTypes: fn({ types: [] }),
      getCommodityFilters: fn({}),
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
      getFactionDetails: fn([]),
      getFactionRegistry: fn(paginated),
      getReputationStandings: fn(paginated),
      getReputationScopes: fn(paginated),
      getFactionDetail: fn(null),
      getSystems: fn([]),
      getCategories: fn([]),
      getMissions: fn(paginated),
      getMissionFilters: fn({ filters: {} }),
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
      getLocationFilters: fn({}),
      getLocationTypes: fn([]),
      getLocationSystems: fn([]),
      getAll: fn([]),
      getTree: fn([]),
      getLocations: fn(paginated),
      getLocation: fn(null),
      getLocationChildren: fn([]),
    },
    correlations: { getSummary: fn({}), getCorrelations: fn([]) },
    unifiedSearch: fn({ ships: [], components: [], items: [], commodities: [], missions: [], recipes: [], locations: [] }),
    getObjectDetail: fn(null),
    getChangelogSummary: fn([]),
    getChangelog: fn({ data: [], total: 0, page: 1, limit: 20, pages: 0 }),
    getPublicStats: fn({}),
    getLatestStats: fn({}),
    getLatestExtraction: fn(null),
    getVersionChangelog: fn({ data: [], total: 0, version: '4.8.1', env: 'live' }),
    getGameVersions: fn({ data: [], total: 0 }),
    getTranslations: fn(paginated),
    getTranslationById: fn(null),
    getStats: fn({}),
    getExtractionLog: fn([]),
  };

  const shipMatrixService = {
    getStats: fn({ total: 0 }),
    getAll: fn([]),
    search: fn([]),
    getById: fn(null),
    getByName: fn(null),
    sync: fn({ synced: 0 }),
  };

  const rsiWebsiteService = {
    getGalactapediaEntries: fn(paginated),
    getGalactapediaEntry: fn(null),
    getCommLinks: fn(paginated),
    getCommLink: fn(null),
    getCommLinkCategories: fn([]),
    getCommLinkImages: fn(paginated),
    getRandomCommLinkImage: fn(null),
    getCommLinkImage: fn(null),
    getStarmapSystems: fn(paginated),
    getStarmapSystem: fn(null),
    getStarmapLocations: fn(paginated),
    getStarmapLocation: fn(null),
    getStarmapFilters: fn({ filters: {} }),
    getStarmapPositions: fn([]),
    getJumpPoints: fn([]),
  };

  const prisma = {
    $queryRawUnsafe: async () => [],
    missionBroker: {
      count: async () => 0,
      findMany: async () => [],
    },
  };

  return {
    prisma,
    shipMatrixService,
    gameDataService,
    rsiWebsiteService,
  };
}

/** Corps comparable : clés triées, `responseTime` retiré (horloge). */
export function normalizeBody(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeBody(item));
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    if (key === 'responseTime') continue;
    out[key] = normalizeBody((value as Record<string, unknown>)[key]);
  }
  return out;
}

export function envelopeOf(body: unknown): string[] {
  if (body === null) return ['null'];
  if (Array.isArray(body)) return ['[]'];
  if (typeof body !== 'object') return [typeof body];
  return Object.keys(normalizeBody(body) as Record<string, unknown>);
}

export function fieldsOf(value: unknown, prefix = ''): string[] {
  const normalized = prefix === '' ? normalizeBody(value) : value;
  if (Array.isArray(normalized)) {
    const here = prefix ? `${prefix}[]` : '[]';
    const nested = normalized[0] && typeof normalized[0] === 'object' ? fieldsOf(normalized[0], here) : [];
    return [here, ...nested];
  }
  if (normalized === null || typeof normalized !== 'object') return [];
  const paths: string[] = [];
  for (const key of Object.keys(normalized as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    paths.push(path, ...fieldsOf((normalized as Record<string, unknown>)[key], path));
  }
  return paths;
}

export function snapshotOf(probe: ContractProbe, status: number, body: unknown): ContractSnapshot {
  const bodyNormalized = normalizeBody(body);
  return {
    id: probe.id,
    version: probe.version,
    path: probe.path,
    status,
    envelope: envelopeOf(body),
    fields: fieldsOf(bodyNormalized),
    body: bodyNormalized,
  };
}

type RouteFactory = (deps: ReturnType<typeof makeContractDeps>) => express.Router;
type ShapeMiddleware = RequestHandler;

export function mountContractApp(createRoutes: RouteFactory, responseShapeMiddleware: ShapeMiddleware): Express {
  const app = express();
  app.use(express.json());
  app.use(responseShapeMiddleware);
  app.use('/', createRoutes(makeContractDeps() as never));
  return app;
}

export async function collectSnapshots(app: Express): Promise<ContractSnapshot[]> {
  const snapshots: ContractSnapshot[] = [];
  for (const probe of CONTRACT_PROBES) {
    const res = await request(app).get(probe.path);
    snapshots.push(snapshotOf(probe, res.status, res.body));
  }
  return snapshots;
}

export function loadHerdrFixture(apiRoot = process.cwd()) {
  const raw = readFileSync(join(apiRoot, 'tests', 'fixtures', 'version-contract.herdr.json'), 'utf8');
  return JSON.parse(raw) as {
    baseline: { ref: string; commit: string; subject: string; unversionedUniverseRoutes: number };
    probes: ContractSnapshot[];
  };
}
