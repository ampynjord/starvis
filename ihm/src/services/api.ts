import type {
  BuyLocation,
  ChangelogEntry,
  ChangelogSummary,
  Commodity,
  CompatibleComponent,
  Component,
  ComponentListItem,
  CommodityPrice,
  Hardpoint,
  Item,
  ItemBuyLocation,
  ItemListItem,
  LoadoutNode,
  LoadoutResult,
  Manufacturer,
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
    overview: () => get<StatsOverview>('/stats/overview'),
    version: () => get<Version>('/version'),
  },

  // ─── Ships ─────────────────────────────────────────────────────────
  ships: {
    list: (p: {
      page?: number;
      limit?: number;
      search?: string;
      manufacturer?: string;
      role?: string;
      career?: string;
      size?: number;
      variant_type?: string;
    }) => get<PaginatedResponse<ShipListItem>>('/ships', p),
    filters: () => get<ShipFilters>('/ships/filters'),
    search: (search: string, limit = 8) => get<ShipListItem[]>('/ships/search', { search, limit }),
    random: () => get<ShipListItem>('/ships/random'),
    manufacturers: () => get<{ code: string; name: string }[]>('/ships/manufacturers'),
    get: (uuid: string) => get<Ship>(`/ships/${uuid}`),
    loadout: (uuid: string) => get<LoadoutNode[]>(`/ships/${uuid}/loadout`),
    paints: (uuid: string) => get<ShipPaint[]>(`/ships/${uuid}/paints`),
    stats: (uuid: string) => get<ShipStats>(`/ships/${uuid}/stats`),
    hardpoints: (uuid: string) => get<Hardpoint[]>(`/ships/${uuid}/hardpoints`),
    similar: (uuid: string, limit = 6) => get<ShipListItem[]>(`/ships/${uuid}/similar`, { limit }),
    compare: (uuid1: string, uuid2: string) => get<ShipComparison>(`/ships/${uuid1}/compare/${uuid2}`),
    modules: (uuid: string) => get<ShipModule[]>(`/ships/${uuid}/modules`),
    ranking: (sort_by: string, order: 'asc' | 'desc', category?: string) =>
      get<ShipListItem[]>('/ships/ranking', { sort_by, order, category }),
  },

  // ─── Components ────────────────────────────────────────────────────
  components: {
    list: (p: {
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
    filters: () => get<Record<string, string[]>>('/components/filters'),
    get: (uuid: string) => get<Component>(`/components/${uuid}`),
    buyLocations: (uuid: string) => get<BuyLocation[]>(`/components/${uuid}/buy-locations`),
    ships: (uuid: string) => get<ShipListItem[]>(`/components/${uuid}/ships`),
    compatible: (opts: { type?: string; min_size?: number; max_size?: number; search?: string; sort?: string; order?: string; limit?: number }) =>
      get<CompatibleComponent[]>('/components/compatible', opts as Record<string, string | number | boolean | undefined>),
  },

  // ─── Items ─────────────────────────────────────────────────────────
  items: {
    list: (p: {
      page?: number;
      limit?: number;
      search?: string;
      type?: string;
      sub_type?: string;
      size?: number;
      grade?: string;
      manufacturer?: string;
    }) => get<PaginatedResponse<ItemListItem>>('/items', p),
    types: () => get<string[]>('/items/types'),
    filters: () => get<Record<string, string[]>>('/items/filters'),
    get: (uuid: string) => get<Item>(`/items/${uuid}`),
    buyLocations: (uuid: string) => get<ItemBuyLocation[]>(`/items/${uuid}/buy-locations`),
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
    list: (p?: { system?: string; city?: string }) => get<Shop[]>('/shops', p),
    inventory: (id: number) => get<unknown[]>(`/shops/${id}/inventory`),
  },

  // ─── Commodities ───────────────────────────────────────────────────
  commodities: {
    list: (p: { page?: number; limit?: number; search?: string; type?: string }) => get<PaginatedResponse<Commodity>>('/commodities', p),
    types: () => get<string[]>('/commodities/types'),
    get: (uuid: string) => get<Commodity>(`/commodities/${uuid}`),
  },

  // ─── Search ────────────────────────────────────────────────────────
  search: (query: string, limit = 5) => get<SearchResult>('/search', { search: query, limit }),

  // ─── Changelog ─────────────────────────────────────────────────────
  changelog: {
    list: (p: { limit?: number; offset?: number; entity_type?: string; change_type?: string }) =>
      get<{ data: ChangelogEntry[]; total: number }>('/changelog', p),
    summary: () => get<ChangelogSummary>('/changelog/summary'),
  },

  // ─── Trade ─────────────────────────────────────────────────────────
  trade: {
    prices: (opts?: { commodity_uuid?: string; system?: string }) =>
      get<CommodityPrice[]>('/trade/prices', opts as Record<string, string | undefined>),
    routes: (opts?: { cargo_scu?: number; system?: string }) =>
      get<TradeRoute[]>('/trade/routes', opts as Record<string, string | number | undefined>),
    locations: (system?: string) =>
      get<TradeLocation[]>('/trade/locations', system ? { system } : undefined),
  },

  // ─── Loadout simulator ─────────────────────────────────────────────
  loadout: {
    calculate: (shipUuid: string, swaps: { portName: string; componentUuid: string }[]) =>
      post<LoadoutResult>('/loadout/calculate', { shipUuid, swaps }),
  },
};
