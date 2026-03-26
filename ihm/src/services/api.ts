import type {
  BuyLocation,
  ChangelogEntry,
  ChangelogSummary,
  Commodity,
  CommodityPrice as CommodityPriceRow,
  CompatibleComponent,
  Component,
  ComponentListItem,
  CraftingCategory,
  CraftingRecipe,
  CraftingResource,
  FpsDamageResult,
  Hardpoint,
  Item,
  ItemBuyLocation,
  ItemListItem,
  LoadoutNode,
  LoadoutResult,
  LocationCommodityPrice,
  Manufacturer,
  MiningComposition,
  MiningElement,
  MiningLaserInfo,
  MiningSolverResult,
  MiningStats,
  MiningYieldResult,
  Mission,
  PaginatedResponse,
  PaintListItem,
  SearchResult,
  Ship,
  ShipComparison,
  ShipFilters,
  ShipListItem,
  ShipModule,
  ShipPaint,
  ShipStats,
  Shop,
  StatsOverview,
  TradeLocation,
  TradeRoute,
  Version,
} from '@/types/api';
import { API_BASE } from '@/utils/constants';

async function get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const url = new URL(API_BASE + path, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString());
  const json = ((await res.json().catch(() => null)) as Record<string, unknown> | null) ?? {};
  if (!res.ok) throw new Error(String(json.error ?? '') || `HTTP ${res.status}: ${res.statusText}`);
  // Paginated list: numeric 'total' AND array 'data' at top level → return full response
  if (typeof json.total === 'number' && Array.isArray(json.data)) return json as unknown as T;
  // Wrapped response: {success: true, data: T} → unwrap
  if ('success' in json && 'data' in json) return json.data as T;
  return json as unknown as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = ((await res.json().catch(() => null)) as Record<string, unknown> | null) ?? {};
  if (!res.ok) throw new Error(String(json.error ?? '') || `HTTP ${res.status}: ${res.statusText}`);
  if ('success' in json && 'data' in json) return json.data as T;
  return json as unknown as T;
}

// ─── Stats / Version ─────────────────────────────────────────────────────────
export const api = {
  stats: {
    overview: (env?: string) => get<StatsOverview>('/stats/overview', { env }),
    version: (env?: string) => get<Version>('/version', { env }),
  },

  // ─── Ships ─────────────────────────────────────────────────────────
  ships: {
    list: (p: {
      env?: string;
      page?: number;
      limit?: number;
      search?: string;
      manufacturer?: string;
      role?: string;
      career?: string;
      size?: number;
      variant_type?: string;
    }) => get<PaginatedResponse<ShipListItem>>('/ships', p),
    filters: (env?: string) => get<ShipFilters>('/ships/filters', { env }),
    search: (search: string, limit = 8, env?: string) => get<ShipListItem[]>('/ships/search', { search, limit, env }),
    random: (env?: string) => get<ShipListItem>('/ships/random', { env }),
    manufacturers: (env?: string) => get<{ code: string; name: string }[]>('/ships/manufacturers', { env }),
    get: (uuid: string, env?: string) => get<Ship>(`/ships/${uuid}`, { env }),
    loadout: (uuid: string, env?: string) => get<LoadoutNode[]>(`/ships/${uuid}/loadout`, { env }),
    paints: (uuid: string, env?: string) => get<ShipPaint[]>(`/ships/${uuid}/paints`, { env }),
    stats: (uuid: string, env?: string) => get<ShipStats>(`/ships/${uuid}/stats`, { env }),
    hardpoints: (uuid: string, env?: string) => get<Hardpoint[]>(`/ships/${uuid}/hardpoints`, { env }),
    similar: (uuid: string, limit = 6, env?: string) => get<ShipListItem[]>(`/ships/${uuid}/similar`, { limit, env }),
    compare: (uuid1: string, uuid2: string, env?: string) => get<ShipComparison>(`/ships/${uuid1}/compare/${uuid2}`, { env }),
    modules: (uuid: string, env?: string) => get<ShipModule[]>(`/ships/${uuid}/modules`, { env }),
    ranking: (sort_by: string, order: 'asc' | 'desc', category?: string, env?: string) =>
      get<ShipListItem[]>('/ships/ranking', { sort_by, order, category, env }),
  },

  // ─── Components ────────────────────────────────────────────────────
  components: {
    list: (p: {
      env?: string;
      page?: number;
      limit?: number;
      search?: string;
      type?: string;
      sub_type?: string;
      size?: number;
      grade?: string;
      manufacturer?: string;
    }) => get<PaginatedResponse<ComponentListItem>>('/components', p),
    types: (env?: string) => get<string[]>('/components/types', { env }),
    filters: (env?: string) => get<Record<string, string[]>>('/components/filters', { env }),
    get: (uuid: string, env?: string) => get<Component>(`/components/${uuid}`, { env }),
    buyLocations: (uuid: string, env?: string) => get<BuyLocation[]>(`/components/${uuid}/buy-locations`, { env }),
    ships: (uuid: string, env?: string) => get<ShipListItem[]>(`/components/${uuid}/ships`, { env }),
    compatible: (opts: {
      env?: string;
      type?: string;
      min_size?: number;
      max_size?: number;
      search?: string;
      sort?: string;
      order?: string;
      limit?: number;
    }) => get<CompatibleComponent[]>('/components/compatible', opts as Record<string, string | number | boolean | undefined>),
  },

  // ─── Items ─────────────────────────────────────────────────────────
  items: {
    list: (p: {
      env?: string;
      page?: number;
      limit?: number;
      search?: string;
      type?: string;
      types?: string;
      sub_type?: string;
      size?: number;
      grade?: string;
      manufacturer?: string;
    }) => get<PaginatedResponse<ItemListItem>>('/items', p),
    types: (env?: string) => get<string[]>('/items/types', { env }),
    filters: (env?: string) => get<Record<string, string[]>>('/items/filters', { env }),
    get: (uuid: string, env?: string) => get<Item>(`/items/${uuid}`, { env }),
    buyLocations: (uuid: string, env?: string) => get<ItemBuyLocation[]>(`/items/${uuid}/buy-locations`, { env }),
  },

  // ─── Manufacturers ─────────────────────────────────────────────────
  manufacturers: {
    list: (env?: string) => get<Manufacturer[]>('/manufacturers', { env }),
    get: (code: string, env?: string) => get<Manufacturer>(`/manufacturers/${code}`, { env }),
    ships: (code: string, env?: string) => get<ShipListItem[]>(`/manufacturers/${code}/ships`, { env }),
    components: (code: string, env?: string) => get<ComponentListItem[]>(`/manufacturers/${code}/components`, { env }),
  },

  // ─── Paints ────────────────────────────────────────────────────────
  paints: {
    list: (p?: { env?: string; page?: number; limit?: number; ship_uuid?: string; search?: string }) =>
      get<PaginatedResponse<PaintListItem>>('/paints', p),
  },

  // ─── Shops ─────────────────────────────────────────────────────────
  shops: {
    list: (p?: { env?: string; system?: string; city?: string }) => get<PaginatedResponse<Shop>>('/shops', p),
    inventory: (id: number, env?: string) => get<unknown[]>(`/shops/${id}/inventory`, { env }),
  },

  // ─── Commodities ───────────────────────────────────────────────────
  commodities: {
    list: (p: { env?: string; page?: number; limit?: number; search?: string; type?: string; types?: string }) =>
      get<PaginatedResponse<Commodity>>('/commodities', p),
    types: (env?: string) => get<string[]>('/commodities/types', { env }),
    get: (uuid: string, env?: string) => get<Commodity>(`/commodities/${uuid}`, { env }),
  },

  // ─── Search ────────────────────────────────────────────────────────
  search: (query: string, limit = 5, env?: string) => get<SearchResult>('/search', { search: query, limit, env }),

  // ─── Changelog ─────────────────────────────────────────────────────
  changelog: {
    list: (p: { limit?: number; offset?: number; entity_type?: string; change_type?: string }) =>
      get<{ data: ChangelogEntry[]; total: number }>('/changelog', p),
    summary: () => get<ChangelogSummary>('/changelog/summary'),
  },

  // ─── Loadout simulator ─────────────────────────────────────────────
  loadout: {
    calculate: (shipUuid: string, swaps: { portId?: number; portName?: string; componentUuid: string }[]) =>
      post<LoadoutResult>('/loadout/calculate', { shipUuid, swaps }),
  },

  // ─── Calculators ───────────────────────────────────────────────────
  calculate: {
    fpsDamage: (input: {
      itemUuid: string;
      env?: string;
      fireMode?: 'Single' | 'Burst' | 'Auto';
      hitbox?: 'head' | 'torso' | 'arm' | 'leg';
      armorClass?: 'none' | 'light' | 'medium' | 'heavy';
      health?: number;
      barrelRateBonus?: number;
      underbarrelDamageBonus?: number;
      craftedMitigationBonus?: number;
    }) => post<FpsDamageResult>('/calculate/fps-damage', input),
    miningYield: (input: { compositionUuid: string; env?: string; laserUuid?: string; gadgetUuids?: string[] }) =>
      post<MiningYieldResult>('/calculate/mining-yield', input),
  },

  // ─── Mining ────────────────────────────────────────────────────────
  mining: {
    elements: (env?: string) => get<MiningElement[]>('/mining/elements', { env }),
    element: (uuid: string, env?: string) => get<MiningElement>(`/mining/elements/${uuid}`, { env }),
    compositions: (includeEmpty = false, env?: string) =>
      get<MiningComposition[]>('/mining/compositions', { include_empty: includeEmpty || undefined, env }),
    composition: (uuid: string, env?: string) => get<MiningComposition>(`/mining/compositions/${uuid}`, { env }),
    lasers: (env?: string) => get<MiningLaserInfo[]>('/mining/lasers', { env }),
    solveForElement: (elementUuid: string, minProbability?: number, env?: string) =>
      get<MiningSolverResult[]>('/mining/solver', { element: elementUuid, min_probability: minProbability, env }),
    solveForComposition: (compositionUuid: string, env?: string) =>
      get<MiningSolverResult[]>('/mining/solver', { composition: compositionUuid, env }),
    stats: (env?: string) => get<MiningStats>('/mining/stats', { env }),
  },

  // ─── Missions ──────────────────────────────────────────────────────
  missions: {
    types: (env?: string) => get<string[]>('/missions/types', { env }),
    factions: (env?: string) => get<string[]>('/missions/factions', { env }),
    systems: (env?: string) => get<string[]>('/missions/systems', { env }),
    categories: (env?: string) => get<string[]>('/missions/categories', { env }),
    list: (filters?: {
      env?: string;
      type?: string;
      legal?: string;
      shared?: string;
      faction?: string;
      system?: string;
      category?: string;
      unique?: string;
      minReward?: number;
      maxReward?: number;
      search?: string;
      page?: number;
      limit?: number;
    }) => get<PaginatedResponse<Mission>>('/missions', filters as Record<string, string | number | undefined>),
    get: (uuid: string) => get<Mission>(`/missions/${uuid}`),
  },

  // ─── Crafting ────────────────────────────────────────────────────────
  crafting: {
    categories: (env?: string) => get<CraftingCategory[]>('/crafting/categories', { env }),
    stationTypes: (env?: string) => get<string[]>('/crafting/station-types', { env }),
    recipes: (filters?: {
      env?: string;
      category?: string;
      search?: string;
      page?: number;
      limit?: number;
      skillLevel?: number;
      stationType?: string;
    }) => get<PaginatedResponse<CraftingRecipe>>('/crafting/recipes', filters as Record<string, string | number | undefined>),
    recipe: (uuid: string, env?: string) => get<CraftingRecipe>(`/crafting/recipes/${uuid}`, { env }),
    resources: (env?: string) => get<CraftingResource[]>('/crafting/resources', { env }),
    recipesByResource: (itemName: string, env?: string) => get<CraftingRecipe[]>(`/crafting/resources/${encodeURIComponent(itemName)}/recipes`, { env }),
  },

  // ─── Trade ──────────────────────────────────────────────────────────
  trade: {
    locations: (env?: string) => get<TradeLocation[]>('/trade/locations', { env }),
    systems: (env?: string) => get<string[]>('/trade/systems', { env }),
    commodityPrices: (commodityUuid: string, env?: string) => get<CommodityPriceRow[]>(`/trade/prices/${commodityUuid}`, { env }),
    locationPrices: (shopId: number, env?: string) => get<LocationCommodityPrice[]>(`/trade/location/${shopId}/prices`, { env }),
    reportPrice: (data: { commodityUuid: string; shopId: number; buyPrice?: number; sellPrice?: number; env?: string }) =>
      post<{ inserted?: boolean; updated?: boolean }>('/trade/prices', data),
    routes: (
      scu: number,
      opts?: { budget?: number; env?: string; limit?: number; commodity?: string; buySystem?: string; sellSystem?: string; sort?: string },
    ) => get<TradeRoute[]>('/trade/routes', { scu, ...opts }),
  },
};
