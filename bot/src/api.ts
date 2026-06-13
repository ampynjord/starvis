import { API_BASE_URL, API_TIMEOUT_MS, API_TOKEN } from './config.js';

export async function apiFetch<T>(path: string): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
    headers: {
      Accept: 'application/json',
      ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
    },
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
  uuid?: string;
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
  sub_type?: string;
  size?: number;
  grade?: string;
  manufacturer?: string;
  manufacturer_name?: string;
  weapon_dps?: number;
  weapon_burst_dps?: number;
  weapon_sustained_dps?: number;
  shield_hp?: number;
  shield_regen?: number;
  qd_speed?: number;
  qd_range?: number;
  cooling_rate?: number;
  power_output?: number;
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
  data: Record<string, number | string | null>;
}

export interface MiningElementResult {
  uuid: string;
  name: string;
  symbol?: string;
  type?: string;
  rarity?: string;
  instability?: number;
  resistance?: number;
  value?: number;
}

export interface MiningCompositionResult {
  uuid: string;
  name: string;
  displayName?: string;
  type?: string;
  partCount?: number;
  elements?: Array<{ name?: string; symbol?: string; probability?: number; percentage?: number }>;
}

export interface MiningLaserResult {
  uuid: string;
  name: string;
  size?: number;
  grade?: string;
  manufacturerCode?: string;
  miningSpeed?: number;
  miningRange?: number;
  miningResistance?: number;
  miningInstability?: number;
}

export interface CraftingRecipeResult {
  uuid: string;
  name?: string;
  displayName?: string;
  category?: string;
  subCategory?: string;
  skillLevel?: number;
  stationType?: string;
  craftingTime?: number;
  outputItemName?: string;
  outputQuantity?: number;
  ingredients?: Array<{ itemName?: string; quantity?: number; type?: string }>;
}

export interface BlueprintRewardResult {
  uuid?: string;
  name?: string;
  blueprintName?: string;
  itemName?: string;
  sourceName?: string;
  rarity?: string;
  type?: string;
}

export interface LocationResult {
  uuid: string;
  name: string;
  type?: string;
  system?: string;
  parentName?: string;
  planet?: string;
  jurisdiction?: string;
  hasQuantumMarker?: boolean;
  positionX?: number;
  positionY?: number;
  positionZ?: number;
}

export interface ShopResult {
  id: number;
  name: string;
  locationName?: string;
  location_name?: string;
  type?: string;
  shopType?: string;
  category?: string;
  system?: string;
  itemCount?: number;
  inventoryCount?: number;
}

export interface ShopInventoryItem {
  itemName?: string;
  name?: string;
  type?: string;
  subType?: string;
  basePrice?: number;
  price?: number;
  buyPrice?: number;
  sellPrice?: number;
}

export interface PaintResult {
  uuid: string;
  name: string;
  manufacturer?: string;
  vehicleName?: string;
  vehicle_name?: string;
  color?: string;
  description?: string;
}

export interface FactionResult {
  uuid?: string;
  code?: string;
  name: string;
  description?: string;
  reputationScope?: string;
  lawfulness?: string;
  type?: string;
}

export interface GalactapediaResult {
  id: number | string;
  title: string;
  excerpt?: string;
  type?: string;
  url?: string;
}

export interface CommLinkResult {
  id: number | string;
  title: string;
  subtitle?: string;
  category?: string;
  publishedAt?: string;
  url?: string;
}

export interface StarmapSystemResult {
  code: string;
  name: string;
  type?: string;
  affiliation?: string;
  economy?: string;
  danger?: string;
  description?: string;
}

// --- Public API functions ---

export async function searchAll(query: string): Promise<SearchResponse> {
  return apiFetch<SearchResponse>(`/api/v1/search?search=${encodeURIComponent(query)}&limit=5`);
}

export async function getShips(query: string): Promise<PaginatedResponse<ShipResult>> {
  return apiFetch<PaginatedResponse<ShipResult>>(`/api/v1/ships?search=${encodeURIComponent(query)}&limit=5`);
}

export async function getTopShips(opts: {
  sort: string;
  order?: 'asc' | 'desc';
  category?: 'ship' | 'ground' | 'gravlev';
  limit?: number;
}): Promise<PaginatedResponse<ShipResult>> {
  const params = new URLSearchParams();
  params.set('sort', opts.sort);
  params.set('order', opts.order ?? 'desc');
  params.set('limit', String(opts.limit ?? 10));
  if (opts.category) params.set('vehicle_category', opts.category);
  return apiFetch<PaginatedResponse<ShipResult>>(`/api/v1/ships?${params}`);
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

export async function getMiningStats(): Promise<{ success: boolean; data: Record<string, number> }> {
  return apiFetch('/api/v1/mining/stats');
}

export async function getMiningElements(): Promise<{ success: boolean; count: number; data: MiningElementResult[] }> {
  return apiFetch('/api/v1/mining/elements');
}

export async function getMiningCompositions(query?: string): Promise<{ success: boolean; count: number; data: MiningCompositionResult[] }> {
  const data = await apiFetch<{ success: boolean; count: number; data: MiningCompositionResult[] }>('/api/v1/mining/compositions');
  if (!query?.trim()) return data;
  const needle = query.toLowerCase();
  return { ...data, data: data.data.filter((item) => (item.displayName ?? item.name ?? '').toLowerCase().includes(needle)) };
}

export async function getMiningLasers(): Promise<{ success: boolean; count: number; data: MiningLaserResult[] }> {
  return apiFetch('/api/v1/mining/lasers');
}

export async function getComponents(query: string, type?: string): Promise<PaginatedResponse<ComponentResult>> {
  const params = new URLSearchParams();
  params.set('search', query);
  params.set('limit', '5');
  if (type) params.set('type', type);
  return apiFetch<PaginatedResponse<ComponentResult>>(`/api/v1/components?${params}`);
}

export async function getTopComponents(opts: {
  type?: string;
  sort: string;
  order?: 'asc' | 'desc';
  limit?: number;
}): Promise<PaginatedResponse<ComponentResult>> {
  const params = new URLSearchParams();
  params.set('sort', opts.sort);
  params.set('order', opts.order ?? 'desc');
  params.set('limit', String(opts.limit ?? 10));
  if (opts.type) params.set('type', opts.type);
  return apiFetch<PaginatedResponse<ComponentResult>>(`/api/v1/components?${params}`);
}

export async function getItems(query: string): Promise<PaginatedResponse<ItemResult>> {
  return apiFetch<PaginatedResponse<ItemResult>>(`/api/v1/items?search=${encodeURIComponent(query)}&limit=5`);
}

export async function getCraftingRecipes(query: string, limit = 5): Promise<PaginatedResponse<CraftingRecipeResult>> {
  return apiFetch<PaginatedResponse<CraftingRecipeResult>>(`/api/v1/crafting/recipes?search=${encodeURIComponent(query)}&limit=${limit}`);
}

export async function getBlueprintRewards(query: string, limit = 5): Promise<PaginatedResponse<BlueprintRewardResult>> {
  return apiFetch<PaginatedResponse<BlueprintRewardResult>>(
    `/api/v1/blueprints/rewards?search=${encodeURIComponent(query)}&limit=${limit}`,
  );
}

export async function getLocations(query: string, limit = 6): Promise<PaginatedResponse<LocationResult>> {
  return apiFetch<PaginatedResponse<LocationResult>>(`/api/v1/locations?search=${encodeURIComponent(query)}&limit=${limit}`);
}

export async function getShops(query: string, limit = 6): Promise<PaginatedResponse<ShopResult>> {
  return apiFetch<PaginatedResponse<ShopResult>>(`/api/v1/shops?search=${encodeURIComponent(query)}&limit=${limit}`);
}

export async function getShopInventory(shopId: number): Promise<{ success: boolean; count: number; data: ShopInventoryItem[] }> {
  return apiFetch(`/api/v1/shops/${shipIdSafe(shopId)}/inventory`);
}

function shipIdSafe(id: number): number {
  if (!Number.isInteger(id) || id < 1) throw new Error('Invalid shop ID');
  return id;
}

export async function getPaints(query: string, limit = 6): Promise<PaginatedResponse<PaintResult>> {
  return apiFetch<PaginatedResponse<PaintResult>>(`/api/v1/paints?search=${encodeURIComponent(query)}&limit=${limit}`);
}

export async function getFactions(query?: string): Promise<{ success: boolean; count: number; data: FactionResult[] }> {
  const params = new URLSearchParams();
  if (query) params.set('search', query);
  return apiFetch(`/api/v1/factions${params.size ? `?${params}` : ''}`);
}

export async function getGalactapedia(query: string, limit = 5): Promise<PaginatedResponse<GalactapediaResult>> {
  return apiFetch<PaginatedResponse<GalactapediaResult>>(`/api/v1/galactapedia?search=${encodeURIComponent(query)}&limit=${limit}`);
}

export async function getCommLinks(query: string, limit = 5): Promise<PaginatedResponse<CommLinkResult>> {
  return apiFetch<PaginatedResponse<CommLinkResult>>(`/api/v1/comm-links?search=${encodeURIComponent(query)}&limit=${limit}`);
}

export async function getStarmapSystems(query?: string): Promise<{ success: boolean; count: number; data: StarmapSystemResult[] }> {
  const params = new URLSearchParams();
  if (query) params.set('search', query);
  return apiFetch(`/api/v1/starmap/systems${params.size ? `?${params}` : ''}`);
}

export async function getGameVersion(): Promise<VersionResponse> {
  return apiFetch<VersionResponse>('/api/v1/game-versions/default');
}

export async function getChangelog(limit = 5): Promise<ChangelogResponse> {
  return apiFetch<ChangelogResponse>(`/api/v1/changelog?limit=${limit}`);
}

export async function getMissions(
  opts: { search?: string; type?: string; limit?: number } = {},
): Promise<PaginatedResponse<MissionResult>> {
  const params = new URLSearchParams();
  if (opts.search) params.set('search', opts.search);
  if (opts.type) params.set('type', opts.type);
  params.set('limit', String(opts.limit ?? 5));
  return apiFetch<PaginatedResponse<MissionResult>>(`/api/v1/missions?${params}`);
}

export async function compareShips(uuid1: string, uuid2: string): Promise<CompareResponse> {
  return apiFetch<CompareResponse>(`/api/v1/ships/${encodeURIComponent(uuid1)}/compare/${encodeURIComponent(uuid2)}`);
}

export async function getShipLoadout(uuid: string): Promise<LoadoutResponse> {
  return apiFetch<LoadoutResponse>(`/api/v1/ships/${encodeURIComponent(uuid)}/loadout`);
}

export async function getManufacturers(): Promise<PaginatedResponse<ManufacturerResult>> {
  return apiFetch<PaginatedResponse<ManufacturerResult>>('/api/v1/manufacturers?limit=50');
}

/** Lightweight autocomplete — returns up to 25 matching ship names for Discord autocomplete. */
export async function getShipsAutocomplete(query: string): Promise<Array<{ name: string; value: string }>> {
  if (!query.trim()) return [];
  try {
    const res = await apiFetch<PaginatedResponse<ShipResult>>(`/api/v1/ships?search=${encodeURIComponent(query)}&limit=25`);
    return (res.data ?? []).map((s) => ({ name: s.name, value: s.name }));
  } catch {
    return [];
  }
}

export async function chatAsk(messages: { role: 'user' | 'assistant'; content: string }[], apiToken: string): Promise<string> {
  const url = `${API_BASE_URL}/api/v1/chat/ask`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({ messages }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = (await res.json()) as { success: boolean; reply?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? `API ${res.status}: ${res.statusText}`);
  if (!data.success) throw new Error(data.error ?? 'Chat error');
  return data.reply ?? '';
}

// ── Additional types ──────────────────────────────────────

interface VersionResponse {
  success: boolean;
  data: {
    game_version: string;
    env: string;
    extracted_at: string;
    ships_count: number;
    components_count: number;
    items_count: number;
  };
}

interface ChangelogEntry {
  entity_type: string;
  entity_name: string;
  change_type: string;
  field_name?: string;
  old_value?: string;
  new_value?: string;
  created_at: string;
}

interface ChangelogResponse {
  success: boolean;
  data: ChangelogEntry[];
  total: number;
}

export interface MissionResult {
  uuid: string;
  class_name: string;
  title?: string;
  description?: string;
  mission_type?: string;
  is_legal?: boolean;
  faction?: string;
  danger_level?: number;
  reward_min?: number;
  reward_max?: number;
  reward_currency?: string;
  has_blueprint_reward?: boolean;
}

interface CompareResponse {
  success: boolean;
  data: {
    ship1: ShipResult;
    ship2: ShipResult;
    diff: Record<string, { ship1: unknown; ship2: unknown; winner: 1 | 2 | null }>;
  };
}

interface LoadoutResponse {
  success: boolean;
  data: {
    ship: ShipResult;
    ports: Array<{
      port_name: string;
      port_type?: string;
      min_size?: number;
      max_size?: number;
      component_name?: string;
      component_uuid?: string;
    }>;
  };
}

export interface ManufacturerResult {
  code: string;
  name: string;
  description?: string;
  known_for?: string;
}

export type {
  ChangelogEntry,
  ChangelogResponse,
  CommodityResult,
  CompareResponse,
  ComponentResult,
  ItemResult,
  LoadoutResponse,
  PaginatedResponse,
  SearchResponse,
  ShipResult,
  TradeRoute,
  VersionResponse,
};
