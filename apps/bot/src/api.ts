const API_BASE_URL = process.env.API_URL || 'http://api:3000';
const TIMEOUT_MS = 10_000;

async function apiFetch<T>(path: string): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// --- Response types ---

interface PaginatedResponse<T> {
  success: boolean;
  count: number;
  total: number;
  page: number;
  pages: number;
  data: T[];
}

interface SearchResponse {
  success: boolean;
  data: {
    ships: ShipResult[];
    components: ComponentResult[];
    items: ItemResult[];
    commodities: CommodityResult[];
  };
  total: number;
}

interface ShipResult {
  id: number;
  name: string;
  manufacturer?: string;
  manufacturer_code?: string;
  focus?: string;
  size?: string;
  crew_min?: number;
  crew_max?: number;
  price?: number;
  cargo_capacity?: number;
  max_speed?: number;
  scm_speed?: number;
  production_status?: string;
  // Ship-matrix fields
  description?: string;
  length?: string;
  beam?: string;
  height?: string;
  mass?: number;
  mediaStoreSmall?: string;
  mediaStoreLarge?: string;
  url?: string;
  type?: string;
  // Game-data fields
  thumbnail?: string;
  thumbnail_large?: string;
  shield_hp?: number;
  hydrogen_fuel_capacity?: number;
  quantum_fuel_capacity?: number;
  weapon_damage_total?: number;
  missile_damage_total?: number;
  career?: string;
  role?: string;
  vehicle_category?: string;
  insurance_claim_time?: number;
  insurance_expedite_cost?: number;
  manufacturer_name?: string;
  sm_description?: string;
  store_url?: string;
  min_crew?: number;
  max_crew?: number;
  sm_cargo?: number;
  total_hp?: number;
  ship_matrix_id?: number;
}

interface CommodityResult {
  uuid: string;
  name: string;
  class_name?: string;
  type?: string;
  sub_type?: string;
  rarity?: string;
  source_type?: string;
}

interface ComponentResult {
  uuid: string;
  name: string;
  type?: string;
  size?: number;
  grade?: string;
  manufacturer?: string;
}

interface ItemResult {
  uuid: string;
  name: string;
  type?: string;
  subType?: string;
}

interface TradeRoute {
  commodity: string;
  buyLocation: string;
  sellLocation: string;
  buyPrice: number;
  sellPrice: number;
  profitPerUnit: number;
  profitPerScu: number;
  totalProfit: number;
}

interface TradeRoutesResponse {
  success: boolean;
  count: number;
  data: TradeRoute[];
}

interface HealthResponse {
  status: string;
  uptime?: number;
}

interface StatsResponse {
  success: boolean;
  data: Record<string, number>;
}

// --- Public API functions ---

export async function searchAll(query: string): Promise<SearchResponse> {
  return apiFetch<SearchResponse>(`/api/v1/search?search=${encodeURIComponent(query)}&limit=5`);
}

export async function getShips(query: string): Promise<PaginatedResponse<ShipResult>> {
  return apiFetch<PaginatedResponse<ShipResult>>(`/api/v1/ships?search=${encodeURIComponent(query)}&limit=5`);
}

export async function getShipByName(name: string): Promise<{ success: boolean; data: ShipResult }> {
  return apiFetch(`/api/v1/ship-matrix/${encodeURIComponent(name)}`);
}

export async function getCommodities(query: string): Promise<PaginatedResponse<CommodityResult>> {
  return apiFetch<PaginatedResponse<CommodityResult>>(`/api/v1/commodities?search=${encodeURIComponent(query)}&limit=5`);
}

export async function getTradeRoutes(scu: number): Promise<TradeRoutesResponse> {
  return apiFetch<TradeRoutesResponse>(`/api/v1/trade/routes?scu=${scu}&sort=totalProfit&limit=5`);
}

export async function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/health/ready');
}

export async function getStats(): Promise<StatsResponse> {
  return apiFetch<StatsResponse>('/api/v1/stats/overview');
}

export type { CommodityResult, ComponentResult, ItemResult, PaginatedResponse, SearchResponse, ShipResult, TradeRoute };
