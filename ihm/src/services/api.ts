import type {
  AmmoInsight,
  BlueprintRewardInsight,
  BuyLocation,
  ChangelogEntry,
  ChangelogSummary,
  CommLink,
  Commodity,
  CommodityCategory,
  CommodityPrice,
  CompatibleComponent,
  Component,
  ComponentListItem,
  CraftingCategory,
  CraftingRecipe,
  CraftingResource,
  FactionSummary,
  FpsDamageResult,
  GalactapediaEntry,
  GameFactionInsight,
  InventoryContainerInsight,
  Item,
  ItemBuyLocation,
  ItemListItem,
  ItemNavigation,
  LoadoutNode,
  LoadoutResult,
  Location,
  LocationTreeNode,
  LootTableInsight,
  Manufacturer,
  MiningComposition,
  MiningElement,
  MiningLaserInfo,
  MiningYieldResult,
  Mission,
  MissionListResponse,
  ObjectDetail,
  PaginatedResponse,
  PaintGroupsResponse,
  PaintListItem,
  ReputationScopeInsight,
  ReputationStandingInsight,
  SearchResult,
  Ship,
  ShipFilters,
  ShipListItem,
  ShipModule,
  ShipPaint,
  ShipRankingResponse,
  Shop,
  ShopInventoryItem,
  StatsOverview,
  TradeRoute,
  Version,
  WeaponAttachmentModifier,
} from '@/types/api';
import { API_BASE } from '@/utils/constants';

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(attempt: number, res?: Response): number {
  const retryAfter = res?.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number.parseInt(retryAfter, 10);
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 8000);
  }
  return 350 * 2 ** attempt;
}

async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, init);
      if (!RETRYABLE_STATUS.has(res.status) || attempt === maxAttempts - 1) return res;
      await sleep(retryDelay(attempt, res));
    } catch (error) {
      if (attempt === maxAttempts - 1) throw error;
      await sleep(retryDelay(attempt));
    }
  }
  return fetch(url, init);
}

async function get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const url = new URL(API_BASE + path, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const res = await fetchWithRetry(url.toString());
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
    blueprintRewardUuid: item.blueprint_reward_uuid,
    blueprintRewardCount: item.blueprint_reward_count,
    buyInAmount: item.buy_in_amount,
    blueprint_rewards: item.blueprint_rewards?.map(mapCraftingRecipe),
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
    ingredientCount: item.ingredient_count,
    optionalIngredientCount: item.optional_ingredient_count,
    modifierCount: item.modifier_count,
    totalScu: item.total_scu,
    minQualityRequired: item.min_quality_required,
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
    display_shop_type: item.display_shop_type ?? item.shop_type?.replace(/_/g, ' ') ?? undefined,
    locationUuid: item.locationUuid ?? item.location_uuid,
    inventoryCount: item.inventoryCount ?? item.inventory_count,
  };
}

function mapItem<T extends ItemListItem>(item: T): T {
  return {
    ...item,
    displayName: item.display_name,
  };
}

function mapMiningCompositionRef(item: NonNullable<MiningElement['found_in']>[number]) {
  return {
    ...item,
    compositionUuid: item.composition_uuid,
    depositName: item.deposit_name,
    className: item.class_name,
    minPercentage: item.min_percentage,
    maxPercentage: item.max_percentage,
  };
}

function mapMiningCompositionPart(item: NonNullable<MiningComposition['elements']>[number]) {
  return {
    ...item,
    elementUuid: item.element_uuid,
    elementName: item.element_name,
    minPercentage: item.min_percentage,
    maxPercentage: item.max_percentage,
  };
}

function mapMiningElement(item: MiningElement): MiningElement {
  return {
    ...item,
    className: item.class_name,
    commodityUuid: item.commodity_uuid,
    optimalWindowMidpoint: item.optimal_window_midpoint,
    optimalWindowMidpointRand: item.optimal_window_midpoint_rand,
    optimalWindowThinness: item.optimal_window_thinness,
    explosionMultiplier: item.explosion_multiplier,
    clusterFactor: item.cluster_factor,
    rocksContaining: item.rocks_containing,
    avgProbabilityPct: item.avg_probability_pct,
    avgMinPct: item.avg_min_pct,
    avgMaxPct: item.avg_max_pct,
    foundIn: item.found_in?.map(mapMiningCompositionRef),
  };
}

function mapMiningComposition(item: MiningComposition): MiningComposition {
  return {
    ...item,
    className: item.class_name,
    depositName: item.deposit_name,
    minDistinctElements: item.min_distinct_elements,
    elementCount: item.element_count,
    elements: item.elements?.map(mapMiningCompositionPart),
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
      status?: string;
      size?: number;
      variant_type?: string;
      /** Routes to /ships, /ground-vehicles, or /gravlev automatically */
      vehicle_category?: string;
      sort?: string;
      order?: string;
    }) => {
      const { vehicle_category, ...rest } = p;
      const base = vehicle_category === 'ground' ? '/ground-vehicles' : vehicle_category === 'gravlev' ? '/gravlev' : '/ships';
      return get<PaginatedResponse<ShipListItem>>(base, rest);
    },
    filters: async (env?: string, vehicle_category?: string): Promise<ShipFilters> => {
      const base =
        vehicle_category === 'ground' ? '/ground-vehicles/filters' : vehicle_category === 'gravlev' ? '/gravlev/filters' : '/ships/filters';
      const raw = await get<{ filters?: Record<string, { value: string; label?: string; count?: number }[]> }>(base, { env });
      const f = (raw as any).filters ?? (raw as any);
      return {
        manufacturers: (f.manufacturer ?? []).map((m: any) => ({ code: m.value, name: m.label ?? m.value })),
        roles: (f.role ?? []).map((r: any) => r.value),
        careers: (f.career ?? []).map((c: any) => c.value),
        statuses: (f.status ?? []).map((s: any) => ({ value: s.value, label: s.label ?? s.value, count: s.count ?? 0 })),
        variant_types: (f.variant_type ?? []).map((v: any) => v.value),
        vehicle_categories: (f.vehicle_category ?? []).map((c: any) => ({ value: c.value, count: c.count ?? 0 })),
      };
    },
    search: (search: string, limit = 8, env?: string) => get<ShipListItem[]>('/ships/search', { search, limit, env }),
    random: (env?: string) => get<Ship>('/ships/random', { env }),
    get: (uuid: string, env?: string) => get<Ship>(`/ships/${uuid}`, { env }),
    loadout: (uuid: string, env?: string) => get<LoadoutNode[]>(`/ships/${uuid}/loadout`, { env }),
    paints: (uuid: string, env?: string) => get<ShipPaint[]>(`/ships/${uuid}/paints`, { env }),
    similar: (uuid: string, limit = 6, env?: string) => get<ShipListItem[]>(`/ships/${uuid}/similar`, { limit, env }),
    modules: (uuid: string, env?: string) => get<ShipModule[]>(`/ships/${uuid}/modules`, { env }),
    ranking: (opts: {
      sort_by: string;
      order: 'asc' | 'desc';
      category?: string;
      stat_category?: string;
      manufacturer?: string;
      top?: number;
      env?: string;
    }) => get<ShipRankingResponse>('/ships/ranking', opts),
  },

  // ─── Components ────────────────────────────────────────────────────
  components: {
    list: (p: {
      env?: string;
      page?: number;
      limit?: number;
      search?: string;
      type?: string;
      types?: string;
      sub_type?: string;
      sub_types?: string;
      weapon_damage_type?: string;
      cm_type?: string;
      size?: number;
      grade?: string;
      component_class?: string;
      is_bespoke?: boolean;
      manufacturer?: string;
      /** Game component category slug: weapons, shields, quantum-drives, etc. */
      category?: string;
    }) => get<PaginatedResponse<ComponentListItem>>('/components', p),
    categories: (env?: string) => get<{ slug: string; label: string; types: string[] }[]>('/components/categories', { env }),
    filters: async (env?: string) => {
      const res = await get<{
        filters?: {
          size?: { value: string; label?: string; count?: number }[];
          grade?: { value: string; label?: string; count?: number }[];
          component_class?: { value: string; label?: string; count?: number }[];
          is_bespoke?: { value: string; label?: string; count?: number }[];
          manufacturer?: { value: string; label?: string; count?: number }[];
        };
      }>('/components/filters', { env });
      const manufacturers = [
        ...new Map(
          (res.filters?.manufacturer ?? []).map((item) => {
            const value = String(item.value).trim().toUpperCase();
            return [value, { ...item, value, label: item.label ?? value }];
          }),
        ).values(),
      ].sort((a, b) => String(a.label).localeCompare(String(b.label)));
      return {
        sizes: res.filters?.size?.map((f) => f.value) ?? [],
        grades: res.filters?.grade?.map((f) => f.value) ?? [],
        componentClasses: res.filters?.component_class ?? [],
        bespoke: res.filters?.is_bespoke ?? [],
        manufacturers,
      };
    },
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
    /** Generic list — supports all filters */
    list: async (p: {
      env?: string;
      page?: number;
      limit?: number;
      search?: string;
      type?: string;
      types?: string;
      sub_type?: string;
      sub_types?: string;
      exclude_sub_types?: string;
      item_group?: string;
      size?: number;
      grade?: string;
      manufacturer?: string;
    }) => mapPaginated(await get<PaginatedResponse<ItemListItem>>('/items', p), mapItem),
    navigation: (env?: string) => get<ItemNavigation>('/items/navigation', { env }),
    /** Semantic category route — /items/category/:slug */
    category: async (
      slug: string,
      p?: { env?: string; page?: number; limit?: number; search?: string; sub_type?: string; manufacturer?: string },
    ) => mapPaginated(await get<PaginatedResponse<ItemListItem>>(`/items/category/${slug}`, p), mapItem),
    categories: (env?: string) => get<{ slug: string; label: string; count: number }[]>('/items/categories', { env }),
    weaponAttachmentModifiers: (env?: string) => get<WeaponAttachmentModifier[]>('/items/weapon-attachments/modifiers', { env }),
    subTypes: (type?: string, env?: string) => get<{ sub_types: { value: string; count: number }[] }>('/items/sub-types', { type, env }),
    manufacturers: (type?: string, env?: string) =>
      get<{ manufacturers: { code: string; name: string; count: number }[] }>('/items/manufacturers', { type, env }),
    filters: async (env?: string) => {
      const res = await get<{
        filters?: {
          type?: { value: string; count: number }[];
          sub_type?: { value: string; count: number }[];
          manufacturer?: { value: string; label: string }[];
        };
      }>('/items/filters', { env });
      return {
        types: res.filters?.type?.map((t) => t.value) ?? [],
        typeCounts: Object.fromEntries(res.filters?.type?.map((t) => [t.value, Number(t.count)]) ?? []) as Record<string, number>,
        subTypeCounts: Object.fromEntries(res.filters?.sub_type?.map((t) => [t.value, Number(t.count)]) ?? []) as Record<string, number>,
        manufacturers: res.filters?.manufacturer ?? [],
      };
    },
    get: async (uuid: string, env?: string) => mapItem(await get<Item>(`/items/${uuid}`, { env })),
    buyLocations: (uuid: string, env?: string) => get<ItemBuyLocation[]>(`/items/${uuid}/buy-locations`, { env }),
  },

  ammo: {
    stats: (p?: { env?: string; page?: number; limit?: number; search?: string }) => get<PaginatedResponse<AmmoInsight>>('/ammo/stats', p),
  },

  armor: {
    inventoryContainers: (p?: { env?: string; page?: number; limit?: number; search?: string }) =>
      get<PaginatedResponse<InventoryContainerInsight>>('/armor/inventory-containers', p),
  },

  utility: {
    inventoryContainers: (p?: { env?: string; page?: number; limit?: number; search?: string }) =>
      get<PaginatedResponse<InventoryContainerInsight>>('/utility/inventory-containers', p),
  },

  // ─── Manufacturers ─────────────────────────────────────────────────
  manufacturers: {
    list: (env?: string) => get<Manufacturer[]>('/manufacturers', { env }),
    ships: (code: string, env?: string) => get<ShipListItem[]>(`/manufacturers/${code}/ships`, { env }),
    components: (code: string, env?: string) => get<ComponentListItem[]>(`/manufacturers/${code}/components`, { env }),
    items: (code: string, env?: string) => get<ItemListItem[]>(`/manufacturers/${code}/items`, { env }),
  },

  // ─── Paints ────────────────────────────────────────────────────────
  paints: {
    list: (p?: { env?: string; page?: number; limit?: number; ship_uuid?: string; search?: string }) =>
      get<PaginatedResponse<PaintListItem>>('/paints', p),
    groups: (p?: { env?: string; search?: string; manufacturer?: string }) => get<PaintGroupsResponse>('/paints/groups', p),
  },

  // ─── Shops ─────────────────────────────────────────────────────────
  shops: {
    list: async (p?: { env?: string; search?: string; type?: string; page?: number; limit?: number }) =>
      mapPaginated(await get<PaginatedResponse<Shop>>('/shops', p as Record<string, string | number | undefined>), mapShop),
    get: async (shopId: number, env?: string) => mapShop(await get<Shop>(`/shops/${shopId}`, { env })),
    inventory: (shopId: number, env?: string) => get<ShopInventoryItem[]>(`/shops/${shopId}/inventory`, { env }),
  },

  objects: {
    detail: <TData = Record<string, unknown>, TRelated = Record<string, unknown>>(
      type: string,
      id: string | number,
      opts?: { env?: string; include?: string },
    ) => get<ObjectDetail<TData, TRelated>>(`/objects/${encodeURIComponent(type)}/${encodeURIComponent(String(id))}`, opts),
  },

  // ─── Commodities ───────────────────────────────────────────────────
  commodities: {
    list: (p: { env?: string; page?: number; limit?: number; search?: string; type?: string; types?: string; category?: string }) =>
      get<PaginatedResponse<Commodity>>('/commodities', p),
    types: (env?: string) => get<string[]>('/commodities/types', { env }),
    categories: (env?: string) => get<CommodityCategory[]>('/commodities/categories', { env }),
    get: (uuid: string, env?: string) => get<Commodity>(`/commodities/${uuid}`, { env }),
  },

  // ─── Search ────────────────────────────────────────────────────────
  search: (query: string, limit = 5, env?: string) => get<SearchResult>('/search', { search: query, limit, env }),

  // ─── Changelog ─────────────────────────────────────────────────────
  changelog: {
    list: (p: { env?: string; limit?: number; offset?: number; entity_type?: string; change_type?: string; markers_only?: boolean }) =>
      get<{ data: ChangelogEntry[]; total: number }>('/changelog', p),
    summary: (env?: string) => get<ChangelogSummary>('/changelog/summary', { env }),
  },

  // ─── Loadout simulator ─────────────────────────────────────────────
  loadout: {
    calculate: (
      shipUuid: string,
      swaps: { portId?: number; portName?: string; componentUuid: string }[],
      modules?: { slotName: string; moduleClassName: string }[],
    ) => post<LoadoutResult>('/loadout/calculate', { shipUuid, swaps, modules }),
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
    elements: async (env?: string) => (await get<MiningElement[]>('/mining/elements', { env })).map(mapMiningElement),
    compositions: async (includeEmpty = false, env?: string) =>
      (await get<MiningComposition[]>('/mining/compositions', { include_empty: includeEmpty || undefined, env })).map(mapMiningComposition),
    composition: async (uuid: string, env?: string) =>
      mapMiningComposition(await get<MiningComposition>(`/mining/compositions/${uuid}`, { env })),
    lasers: (env?: string) => get<MiningLaserInfo[]>('/mining/lasers', { env }),
  },

  // ─── Missions ──────────────────────────────────────────────────────
  missions: {
    single: async (uuid: string, env?: string) => mapMission(await get<Mission>(`/missions/${uuid}`, { env })),
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
      blueprintReward?: string;
      minReward?: number;
      maxReward?: number;
      search?: string;
      sort?: string;
      page?: number;
      limit?: number;
    }): Promise<MissionListResponse> => {
      const result = await get<MissionListResponse>('/missions', filters as Record<string, string | number | undefined>);
      return { ...mapPaginated(result, mapMission), summary: result.summary };
    },
  },

  factions: {
    list: (env?: string) => get<FactionSummary[]>('/factions', { env }),
    get: (name: string, env?: string) => get<FactionSummary>(`/factions/${encodeURIComponent(name)}`, { env }),
    registry: (p?: { env?: string; page?: number; limit?: number; search?: string }) =>
      get<PaginatedResponse<GameFactionInsight>>('/factions/registry', p),
    reputationStandings: (p?: { env?: string; page?: number; limit?: number; search?: string }) =>
      get<PaginatedResponse<ReputationStandingInsight>>('/factions/reputation-standings', p),
    reputationScopes: (p?: { env?: string; page?: number; limit?: number; search?: string }) =>
      get<PaginatedResponse<ReputationScopeInsight>>('/factions/reputation-scopes', p),
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
      outputItemUuid?: string;
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

  blueprints: {
    rewards: (p?: { env?: string; page?: number; limit?: number; search?: string }) =>
      get<PaginatedResponse<BlueprintRewardInsight>>('/blueprints/rewards', p),
    lootTables: (p?: { env?: string; page?: number; limit?: number; search?: string }) =>
      get<PaginatedResponse<LootTableInsight>>('/blueprints/loot-tables', p),
  },

  // ─── Trade ──────────────────────────────────────────────────────────
  trade: {
    systems: (env?: string) => get<string[]>('/trade/systems', { env }),
    prices: (commodityUuid: string, env?: string) => get<CommodityPrice[]>(`/trade/prices/${commodityUuid}`, { env }),
    reportPrice: (data: { commodityUuid: string; shopId: number; buyPrice?: number; sellPrice?: number; env?: string }) =>
      post<{ inserted?: boolean; updated?: boolean }>('/trade/prices', data),
    routes: (
      scu: number,
      opts?: { budget?: number; env?: string; limit?: number; commodity?: string; buySystem?: string; sellSystem?: string; sort?: string },
    ) => get<TradeRoute[]>('/trade/routes', { scu, ...opts }),
  },

  // ─── Locations ──────────────────────────────────────────────────────
  locations: {
    types: (env?: string) => get<string[]>('/locations/types', { env }),
    systems: (env?: string) => get<string[]>('/locations/systems', { env }),
    list: (filters?: {
      env?: string;
      type?: string;
      types?: string;
      system?: string;
      search?: string;
      hideInStarmap?: string;
      sort?: string;
      order?: string;
      page?: number;
      limit?: number;
    }) => get<PaginatedResponse<Location>>('/locations', filters as Record<string, string | number | undefined>),
    all: (env?: string) => get<Location[]>('/locations/all', { env }),
    tree: (env?: string) => get<LocationTreeNode[]>('/locations/tree', { env }),
    get: (uuid: string, env?: string) => get<Location>(`/locations/${uuid}`, { env }),
    children: (uuid: string, env?: string) => get<Location[]>(`/locations/${uuid}/children`, { env }),
    shops: (uuid: string, env?: string) => get<Shop[]>(`/locations/${uuid}/shops`, { env }),
  },

  // ─── CommLinks ──────────────────────────────────────────────────────
  commLinks: {
    categories: () => get<string[]>('/comm-links/categories'),
    list: (filters?: { search?: string; category?: string; page?: number; limit?: number }) =>
      get<PaginatedResponse<CommLink>>('/comm-links', filters as Record<string, string | number | undefined>),
    get: (id: string) => get<CommLink>(`/comm-links/${id}`),
  },

  // ─── Galactapedia ────────────────────────────────────────────────────
  galactapedia: {
    list: (filters?: { search?: string; category?: string; letter?: string; page?: number; limit?: number }) =>
      get<PaginatedResponse<GalactapediaEntry>>('/galactapedia', filters as Record<string, string | number | undefined>),
    get: (id: string) => get<GalactapediaEntry>(`/galactapedia/${id}`),
  },
};
