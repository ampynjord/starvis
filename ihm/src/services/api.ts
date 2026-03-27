import type {
  BuyLocation,
  ChangelogEntry,
  ChangelogSummary,
  Commodity,
  CompatibleComponent,
  Component,
  ComponentListItem,
  CraftingCategory,
  CraftingRecipe,
  CraftingResource,
  FpsDamageResult,
  Item,
  ItemBuyLocation,
  ItemListItem,
  LoadoutNode,
  LoadoutResult,
  Manufacturer,
  MiningComposition,
  MiningElement,
  MiningLaserInfo,
  MiningYieldResult,
  Mission,
  PaginatedResponse,
  PaintListItem,
  SearchResult,
  Ship,
  ShipFilters,
  ShipListItem,
  ShipModule,
  ShipPaint,
  Shop,
  StatsOverview,
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

function mapMission(item: Mission): Mission {
  return {
    ...item,
    className: item.class_name,
    missionType: item.mission_type,
    displayMissionType: item.display_mission_type,
    canBeShared: item.can_be_shared,
    onlyOwnerComplete: item.only_owner_complete,
    isLegal: item.is_legal,
    completionTimeS: item.completion_time_s,
    rewardMin: item.reward_min,
    rewardMax: item.reward_max,
    rewardCurrency: item.reward_currency,
    missionGiver: item.mission_giver,
    locationSystem: item.location_system,
    locationPlanet: item.location_planet,
    locationName: item.location_name,
    dangerLevel: item.danger_level,
    requiredReputation: item.required_reputation,
    reputationReward: item.reputation_reward,
    baseXp: item.base_xp,
    displayCategory: item.display_category,
    isUnique: item.is_unique,
    hasBlueprintReward: item.has_blueprint_reward,
  };
}

function mapCraftingIngredient(item: NonNullable<CraftingRecipe['ingredients']>[number]) {
  return {
    ...item,
    itemName: item.item_name,
    displayItemName: item.display_item_name,
    itemUuid: item.item_uuid,
    isOptional: item.is_optional,
    minQuality: item.min_quality,
    slotName: item.slot_name,
    displaySlotName: item.display_slot_name,
  };
}

function mapCraftingModifier(item: NonNullable<CraftingRecipe['modifiers']>[number]) {
  return {
    ...item,
    slotName: item.slot_name,
    propertyName: item.property_name,
    displayPropertyName: item.display_property_name,
    propertyUuid: item.property_uuid,
    unitFormat: item.unit_format,
    startQuality: item.start_quality,
    endQuality: item.end_quality,
    modifierAtStart: item.modifier_at_start,
    modifierAtEnd: item.modifier_at_end,
  };
}

function mapCraftingRecipe(item: CraftingRecipe): CraftingRecipe {
  return {
    ...item,
    className: item.class_name,
    displayName: item.display_name,
    displayCategory: item.display_category,
    outputItemName: item.output_item_name,
    displayOutputItemName: item.display_output_item_name,
    outputItemUuid: item.output_item_uuid,
    outputQuantity: item.output_quantity,
    craftingTimeS: item.crafting_time_s,
    stationType: item.station_type,
    displayStationType: item.display_station_type,
    skillLevel: item.skill_level,
    gameEnv: item.game_env,
    ingredients: item.ingredients?.map(mapCraftingIngredient),
    modifiers: item.modifiers?.map(mapCraftingModifier),
  };
}

function mapCraftingCategory(item: CraftingCategory): CraftingCategory {
  return {
    ...item,
    displayCategory: item.display_category,
  };
}

function mapCraftingResource(item: CraftingResource): CraftingResource {
  return {
    ...item,
    itemName: item.item_name,
    displayItemName: item.display_item_name,
    itemUuid: item.item_uuid,
    recipeCount: item.recipe_count,
    totalQuantity: item.total_quantity,
    totalScu: item.total_scu,
  };
}

function mapShop(item: Shop): Shop {
  return {
    ...item,
    className: item.class_name,
    parentLocation: item.parent_location,
    planetMoon: item.planet_moon,
    shopType: item.shop_type,
    displayShopType: item.display_shop_type,
  };
}

function mapPaginated<T>(result: PaginatedResponse<T>, mapItem: (item: T) => T): PaginatedResponse<T> {
  return { ...result, data: result.data.map(mapItem) };
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
    get: (uuid: string, env?: string) => get<Ship>(`/ships/${uuid}`, { env }),
    loadout: (uuid: string, env?: string) => get<LoadoutNode[]>(`/ships/${uuid}/loadout`, { env }),
    paints: (uuid: string, env?: string) => get<ShipPaint[]>(`/ships/${uuid}/paints`, { env }),
    similar: (uuid: string, limit = 6, env?: string) => get<ShipListItem[]>(`/ships/${uuid}/similar`, { limit, env }),
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
    filters: (env?: string) => get<Record<string, string[]>>('/items/filters', { env }),
    get: (uuid: string, env?: string) => get<Item>(`/items/${uuid}`, { env }),
    buyLocations: (uuid: string, env?: string) => get<ItemBuyLocation[]>(`/items/${uuid}/buy-locations`, { env }),
  },

  // ─── Manufacturers ─────────────────────────────────────────────────
  manufacturers: {
    list: (env?: string) => get<Manufacturer[]>('/manufacturers', { env }),
    ships: (code: string, env?: string) => get<ShipListItem[]>(`/manufacturers/${code}/ships`, { env }),
  },

  // ─── Paints ────────────────────────────────────────────────────────
  paints: {
    list: (p?: { env?: string; page?: number; limit?: number; ship_uuid?: string; search?: string }) =>
      get<PaginatedResponse<PaintListItem>>('/paints', p),
  },

  // ─── Shops ─────────────────────────────────────────────────────────
  shops: {
    list: async (p?: { env?: string; system?: string; city?: string }) =>
      mapPaginated(await get<PaginatedResponse<Shop>>('/shops', p), mapShop),
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
    compositions: (includeEmpty = false, env?: string) =>
      get<MiningComposition[]>('/mining/compositions', { include_empty: includeEmpty || undefined, env }),
    composition: (uuid: string, env?: string) => get<MiningComposition>(`/mining/compositions/${uuid}`, { env }),
    lasers: (env?: string) => get<MiningLaserInfo[]>('/mining/lasers', { env }),
  },

  // ─── Missions ──────────────────────────────────────────────────────
  missions: {
    types: (env?: string) => get<string[]>('/missions/types', { env }),
    factions: (env?: string) => get<string[]>('/missions/factions', { env }),
    systems: (env?: string) => get<string[]>('/missions/systems', { env }),
    categories: (env?: string) => get<string[]>('/missions/categories', { env }),
    list: async (filters?: {
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
    }) =>
      mapPaginated(await get<PaginatedResponse<Mission>>('/missions', filters as Record<string, string | number | undefined>), mapMission),
  },

  // ─── Crafting ────────────────────────────────────────────────────────
  crafting: {
    categories: async (env?: string) => (await get<CraftingCategory[]>('/crafting/categories', { env })).map(mapCraftingCategory),
    stationTypes: (env?: string) => get<string[]>('/crafting/station-types', { env }),
    recipes: async (filters?: {
      env?: string;
      category?: string;
      search?: string;
      page?: number;
      limit?: number;
      skillLevel?: number;
      stationType?: string;
    }) =>
      mapPaginated(
        await get<PaginatedResponse<CraftingRecipe>>('/crafting/recipes', filters as Record<string, string | number | undefined>),
        mapCraftingRecipe,
      ),
    recipe: async (uuid: string, env?: string) => mapCraftingRecipe(await get<CraftingRecipe>(`/crafting/recipes/${uuid}`, { env })),
    resources: async (env?: string) => (await get<CraftingResource[]>('/crafting/resources', { env })).map(mapCraftingResource),
    recipesByResource: async (itemName: string, env?: string) =>
      (await get<CraftingRecipe[]>(`/crafting/resources/${encodeURIComponent(itemName)}/recipes`, { env })).map(mapCraftingRecipe),
  },

  // ─── Trade ──────────────────────────────────────────────────────────
  trade: {
    systems: (env?: string) => get<string[]>('/trade/systems', { env }),
    reportPrice: (data: { commodityUuid: string; shopId: number; buyPrice?: number; sellPrice?: number; env?: string }) =>
      post<{ inserted?: boolean; updated?: boolean }>('/trade/prices', data),
    routes: (
      scu: number,
      opts?: { budget?: number; env?: string; limit?: number; commodity?: string; buySystem?: string; sellSystem?: string; sort?: string },
    ) => get<TradeRoute[]>('/trade/routes', { scu, ...opts }),
  },
};
