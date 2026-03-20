import type {
  BuyLocation,
  ChangelogEntry,
  ChangelogSummary,
  Commodity,
  CompatibleComponent,
  Component,
  ComponentListItem,
  Hardpoint,
  Item,
  ItemBuyLocation,
  ItemListItem,
  LoadoutNode,
  LoadoutResult,
  Manufacturer,
  MiningComposition,
  MiningElement,
  MiningSolverResult,
  MiningStats,
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
    overview: () => get<StatsOverview>('/stats/overview'),
    version: () => get<Version>('/version'),
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
    manufacturers: () => get<{ code: string; name: string }[]>('/ships/manufacturers'),
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
    types: () => get<string[]>('/components/types'),
    filters: (env?: string) => get<Record<string, string[]>>('/components/filters', { env }),
    get: (uuid: string, env?: string) => get<Component>(`/components/${uuid}`, { env }),
    buyLocations: (uuid: string, env?: string) => get<BuyLocation[]>(`/components/${uuid}/buy-locations`, { env }),
    ships: (uuid: string) => get<ShipListItem[]>(`/components/${uuid}/ships`),
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
    types: () => get<string[]>('/items/types'),
    filters: () => get<Record<string, string[]>>('/items/filters'),
    get: (uuid: string, env?: string) => get<Item>(`/items/${uuid}`, { env }),
    buyLocations: (uuid: string, env?: string) => get<ItemBuyLocation[]>(`/items/${uuid}/buy-locations`, { env }),
  },

  // ─── Manufacturers ─────────────────────────────────────────────────
  manufacturers: {
    list: () => get<Manufacturer[]>('/manufacturers'),
    get: (code: string) => get<Manufacturer>(`/manufacturers/${code}`),
    ships: (code: string) => get<ShipListItem[]>(`/manufacturers/${code}/ships`),
    components: (code: string) => get<ComponentListItem[]>(`/manufacturers/${code}/components`),
  },

  // ─── Paints ────────────────────────────────────────────────────────
  paints: {
    list: (p?: { page?: number; limit?: number; ship_uuid?: string; search?: string }) =>
      get<PaginatedResponse<PaintListItem>>('/paints', p),
  },

  // ─── Shops ─────────────────────────────────────────────────────────
  shops: {
    list: (p?: { env?: string; system?: string; city?: string }) => get<Shop[]>('/shops', p),
    inventory: (id: number, env?: string) => get<unknown[]>(`/shops/${id}/inventory`, { env }),
  },

  // ─── Commodities ───────────────────────────────────────────────────
  commodities: {
    list: (p: { env?: string; page?: number; limit?: number; search?: string; type?: string }) =>
      get<PaginatedResponse<Commodity>>('/commodities', p),
    types: () => get<string[]>('/commodities/types'),
    get: (uuid: string, env?: string) => get<Commodity>(`/commodities/${uuid}`, { env }),
  },

  // ─── Search ────────────────────────────────────────────────────────
  search: (query: string, limit = 5) => get<SearchResult>('/search', { search: query, limit }),

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

  // ─── Mining ────────────────────────────────────────────────────────
  mining: {
    elements: () => get<MiningElement[]>('/mining/elements'),
    element: (uuid: string) => get<MiningElement>(`/mining/elements/${uuid}`),
    compositions: (includeEmpty = false) => get<MiningComposition[]>('/mining/compositions', { include_empty: includeEmpty || undefined }),
    composition: (uuid: string) => get<MiningComposition>(`/mining/compositions/${uuid}`),
    solveForElement: (elementUuid: string, minProbability?: number) =>
      get<MiningSolverResult[]>('/mining/solver', { element: elementUuid, min_probability: minProbability }),
    solveForComposition: (compositionUuid: string) => get<MiningSolverResult[]>('/mining/solver', { composition: compositionUuid }),
    stats: () => get<MiningStats>('/mining/stats'),
  },

  // ─── Missions ──────────────────────────────────────────────────────
  missions: {
    types: (env?: string) => get<string[]>('/missions/types', { env }),
    list: (filters?: { env?: string; type?: string; legal?: string; shared?: string; search?: string; page?: number; limit?: number }) =>
      get<PaginatedResponse<Mission>>('/missions', filters as Record<string, string | number | undefined>),
    get: (uuid: string) => get<Mission>(`/missions/${uuid}`),
  },
};
