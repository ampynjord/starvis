import type {
  BuyLocation, ChangelogEntry, ChangelogSummary, Commodity,
  Component, ComponentListItem, Hardpoint, Item, ItemListItem,
  LoadoutNode, Manufacturer, PaginatedResponse, SearchResult,
  Ship, ShipComparison, ShipFilters, ShipListItem, ShipPaint,
  ShipStats, Shop, StatsOverview, Version,
} from '@/types/api';
import { API_BASE } from '@/utils/constants';

async function get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(API_BASE + path, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString());
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null ?? {};
  if (!res.ok) throw new Error(String(json['error'] ?? '') || `HTTP ${res.status}: ${res.statusText}`);
  // Paginated list: numeric 'total' AND array 'data' at top level → return full response
  if (typeof json['total'] === 'number' && Array.isArray(json['data'])) return json as unknown as T;
  // Wrapped response: {success: true, data: T} → unwrap
  if ('success' in json && 'data' in json) return json['data'] as T;
  return json as unknown as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
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
      page?: number; limit?: number; search?: string;
      manufacturer?: string; role?: string; career?: string;
      size?: number; variant_type?: string;
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
  },

  // ─── Components ────────────────────────────────────────────────────
  components: {
    list: (p: {
      page?: number; limit?: number; search?: string;
      type?: string; sub_type?: string; size?: number; grade?: string; manufacturer?: string;
    }) => get<PaginatedResponse<ComponentListItem>>('/components', p),
    types: () => get<string[]>('/components/types'),
    filters: () => get<Record<string, string[]>>('/components/filters'),
    get: (uuid: string) => get<Component>(`/components/${uuid}`),
    buyLocations: (uuid: string) => get<BuyLocation[]>(`/components/${uuid}/buy-locations`),
    ships: (uuid: string) => get<ShipListItem[]>(`/components/${uuid}/ships`),
  },

  // ─── Items ─────────────────────────────────────────────────────────
  items: {
    list: (p: {
      page?: number; limit?: number; search?: string;
      type?: string; sub_type?: string; size?: number; grade?: string; manufacturer?: string;
    }) => get<PaginatedResponse<ItemListItem>>('/items', p),
    types: () => get<string[]>('/items/types'),
    filters: () => get<Record<string, string[]>>('/items/filters'),
    get: (uuid: string) => get<Item>(`/items/${uuid}`),
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
    list: (p?: { page?: number; limit?: number; ship_uuid?: string }) =>
      get<PaginatedResponse<ShipPaint>>('/paints', p),
  },

  // ─── Shops ─────────────────────────────────────────────────────────
  shops: {
    list: (p?: { system?: string; city?: string }) => get<Shop[]>('/shops', p),
    inventory: (id: number) => get<unknown[]>(`/shops/${id}/inventory`),
  },

  // ─── Commodities ───────────────────────────────────────────────────
  commodities: {
    list: (p: { page?: number; limit?: number; search?: string; type?: string }) =>
      get<PaginatedResponse<Commodity>>('/commodities', p),
    types: () => get<string[]>('/commodities/types'),
    get: (uuid: string) => get<Commodity>(`/commodities/${uuid}`),
  },

  // ─── Search ────────────────────────────────────────────────────────
  search: (query: string, limit = 5) =>
    get<SearchResult>('/search', { search: query, limit }),

  // ─── Changelog ─────────────────────────────────────────────────────
  changelog: {
    list: (p: { limit?: number; offset?: number; entity_type?: string; change_type?: string }) =>
      get<{ data: ChangelogEntry[]; total: number }>('/changelog', p),
    summary: () => get<ChangelogSummary>('/changelog/summary'),
  },

  // ─── Loadout simulator ─────────────────────────────────────────────
  loadout: {
    calculate: (shipUuid: string, swaps: { portName: string; componentUuid: string }[]) =>
      post<LoadoutNode[]>('/loadout/calculate', { shipUuid, swaps }),
  },
};
