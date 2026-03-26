// ─── Pagination ──────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  count: number;
}

// ─── Overview ─────────────────────────────────────────────────────────────────
export interface StatsOverview {
  ships: number;
  components: number;
  items: number;
  manufacturers: number;
  paints: number;
  commodities: number;
}

export interface Version {
  game_version: string;
  extracted_at: string;
  ships_count: number;
  components_count: number;
}

// ─── Ships ────────────────────────────────────────────────────────────────────
export interface ShipListItem {
  uuid: string;
  name: string;
  short_name: string | null;
  class_name: string;
  manufacturer_name: string | null;
  manufacturer_code: string | null;
  role: string | null;
  career: string | null;
  vehicle_category: string | null;
  crew_size: number | null;
  mass: number | null;
  cross_section_x: number | null; // width
  cross_section_y: number | null; // height
  cross_section_z: number | null; // length
  scm_speed: number | null;
  max_speed: number | null;
  boost_speed_forward: number | null;
  cargo_capacity: number | null;
  min_crew: number | null;
  max_crew: number | null;
  ship_matrix_id: number | null; // non-null = has RSI SM link
  thumbnail: string | null;
  production_status: string | null;
  variant_type: string | null;
  is_concept_only: boolean;
  // Combat / flight stats returned by getAllShips query
  pitch_max: number | null;
  yaw_max: number | null;
  roll_max: number | null;
  total_hp: number | null;
  shield_hp: number | null;
  weapon_damage_total: number | null;
  missile_damage_total: number | null;
  hydrogen_fuel_capacity: number | null;
  quantum_fuel_capacity: number | null;
}

export interface Ship extends ShipListItem {
  size_x: number | null; // width  (m)
  size_y: number | null; // length (m)
  size_z: number | null; // height (m)
  armor_hp: number | null;
  armor_phys_resist: number | null;
  armor_energy_resist: number | null;
  fuse_penetration: number | null;
  component_penetration: number | null;
  boost_ramp_up: number | null;
  boost_ramp_down: number | null;
  boost_speed_backward: number | null;
  armor_physical: number | null;
  armor_energy: number | null;
  armor_distortion: number | null;
  insurance_claim_time: number | null;
  insurance_expedite_cost: number | null;
  sm_description: string | null;
  store_url: string | null;
  sm_cargo: number | null;
  thumbnail_large: string | null;
  game_data: Record<string, unknown> | null;
  armor_signal_ir: number | null;
  armor_signal_em: number | null;
  armor_signal_cs: number | null;
}

export interface LoadoutNode {
  id: number;
  port_name: string;
  port_type: string;
  port_min_size: number | null;
  port_max_size: number | null;
  parent_id: number | null;
  component_uuid: string | null;
  component_name: string | null;
  component_type: string | null;
  component_size: number | null;
  component_class_name: string | null;
  sub_type: string | null;
  grade: string | null;
  manufacturer_code: string | null;
  // Weapons
  weapon_dps: number | null;
  weapon_damage: number | null;
  weapon_fire_rate: number | null;
  weapon_range: number | null;
  weapon_ammo_count: number | null;
  weapon_damage_type: string | null;
  // Shield
  shield_hp: number | null;
  shield_regen: number | null;
  shield_regen_delay: number | null;
  // QD
  qd_speed: number | null;
  qd_spool_time: number | null;
  qd_range: number | null;
  // Power / heat
  power_output: number | null;
  power_draw: number | null;
  power_base: number | null;
  heat_generation: number | null;
  cooling_rate: number | null;
  // Thruster
  thruster_max_thrust: number | null;
  thruster_type: string | null;
  // Rack
  rack_count: number | null;
  rack_missile_size: number | null;
  // Missile
  missile_damage: number | null;
  missile_signal_type: string | null;
  // CM
  cm_ammo_count: number | null;
  // Radar
  radar_range: number | null;
  radar_detection_lifetime: number | null;
  radar_tracking_signal: number | null;
  children: LoadoutNode[];
}

export interface ShipPaint {
  paint_uuid: string;
  paint_name: string;
  paint_class_name: string;
}

export interface PaintListItem extends ShipPaint {
  id: number;
  ship_uuid: string | null;
  ship_name: string | null;
  ship_class_name: string | null;
  manufacturer_name: string | null;
  manufacturer_code: string | null;
}

export interface ShipStats {
  total_hardpoints: number;
  weapons: number;
  shields: number;
  quantum_drives: number;
  fuel_tanks: number;
  coolers: number;
  power_plants: number;
  by_type: Record<string, number>;
}

export interface ShipFilters {
  manufacturers: { code: string; name: string }[];
  roles: string[];
  careers: string[];
  variant_types: string[];
}

// ─── Components ───────────────────────────────────────────────────────────────
export interface ComponentListItem {
  uuid: string;
  class_name: string;
  name: string;
  normalized_name?: string | null;
  canonical_component_key?: string | null;
  source_type?: string | null;
  source_name?: string | null;
  source_reference?: string | null;
  confidence_score?: number | null;
  type: string;
  sub_type: string | null;
  size: number | null;
  grade: string | null;
  manufacturer_code: string | null;
  manufacturer_name: string | null;
}

export interface Component extends ComponentListItem {
  description: string | null;
  mass: number | null;
  hp: number | null;
  power_base: number | null;
  power_draw: number | null;
  power_output: number | null;
  heat_generation: number | null;
  cooling_rate: number | null;
  em_signature: number | null;
  ir_signature: number | null;
  cross_section_signature: number | null;
  weapon_damage: number | null;
  weapon_damage_type: string | null;
  weapon_fire_rate: number | null;
  weapon_range: number | null;
  weapon_speed: number | null;
  weapon_ammo_count: number | null;
  weapon_alpha_damage: number | null;
  weapon_dps: number | null;
  weapon_burst_dps: number | null;
  weapon_sustained_dps: number | null;
  shield_hp: number | null;
  shield_regen: number | null;
  shield_regen_delay: number | null;
  qd_speed: number | null;
  qd_spool_time: number | null;
  qd_range: number | null;
  qd_fuel_rate: number | null;
  missile_damage: number | null;
  missile_speed: number | null;
  missile_range: number | null;
  radar_range: number | null;
  thruster_max_thrust: number | null;
  tractor_max_force: number | null;
  mining_speed: number | null;
  salvage_speed: number | null;
  data_json?: Record<string, unknown> | null;
  game_data: Record<string, unknown> | null;
}

export interface BuyLocation {
  shop_id: number;
  shop_name: string;
  location: string;
  system: string | null;
  city: string | null;
  terminal: string | null;
  shop_source_type?: string | null;
  shop_source_name?: string | null;
  inventory_source_type?: string | null;
  inventory_source_name?: string | null;
  canonical_shop_key?: string | null;
  canonical_location_key?: string | null;
  confidence_score?: number | null;
  base_price: number | null;
  inventory: number | null;
}

// ─── Items ─────────────────────────────────────────────────────────────────────
export interface ItemListItem {
  uuid: string;
  class_name: string;
  name: string;
  normalized_name?: string | null;
  canonical_item_key?: string | null;
  source_type?: string | null;
  source_name?: string | null;
  source_reference?: string | null;
  confidence_score?: number | null;
  type: string;
  sub_type: string | null;
  size: number | null;
  grade: string | null;
  manufacturer_code: string | null;
  manufacturer_name: string | null;
}

export interface Item extends ItemListItem {
  mass: number | null;
  hp: number | null;
  description: string | null;
  weapon_damage?: number | null;
  weapon_damage_type?: string | null;
  weapon_fire_rate?: number | null;
  weapon_range?: number | null;
  weapon_speed?: number | null;
  weapon_ammo_count?: number | null;
  weapon_dps?: number | null;
  armor_damage_reduction?: number | null;
  armor_temp_min?: number | null;
  armor_temp_max?: number | null;
  data_json?: Record<string, unknown> | null;
  game_data: Record<string, unknown> | null;
}

// ─── Manufacturers ────────────────────────────────────────────────────────────
export interface Manufacturer {
  code: string;
  name: string;
  description: string | null;
  known_for: string | null;
  ship_count: number;
  component_count: number;
}

// ─── Commodities ──────────────────────────────────────────────────────────────
export interface Commodity {
  uuid: string;
  class_name: string;
  name: string;
  normalized_name?: string | null;
  canonical_commodity_key?: string | null;
  source_type?: string | null;
  source_name?: string | null;
  source_reference?: string | null;
  confidence_score?: number | null;
  type: string | null;
  sub_type: string | null;
  symbol: string | null;
  occupancy_scu: number | null;
  data_json?: Record<string, unknown> | null;
}

// ─── Shops ────────────────────────────────────────────────────────────────────
export interface Shop {
  id: number;
  name: string;
  normalized_name?: string | null;
  canonical_shop_key?: string | null;
  canonical_location_key?: string | null;
  source_type?: string | null;
  source_name?: string | null;
  source_reference?: string | null;
  confidence_score?: number | null;
  location: string | null;
  parent_location: string | null;
  system: string | null;
  planet_moon: string | null;
  city: string | null;
  shop_type: string | null;
  class_name: string;
}

// ─── Changelog ────────────────────────────────────────────────────────────────
// ─── Mining ───────────────────────────────────────────────────────────────────
export interface MiningElement {
  uuid: string;
  class_name: string;
  name: string;
  commodity_uuid: string | null;
  instability: number | null;
  resistance: number | null;
  optimal_window_midpoint: number | null;
  optimal_window_midpoint_rand: number | null;
  optimal_window_thinness: number | null;
  explosion_multiplier: number | null;
  cluster_factor: number | null;
  /** Aggregated — present in getAllElements */
  rocks_containing?: number;
  avg_probability_pct?: number;
  avg_min_pct?: number;
  avg_max_pct?: number;
  /** Only present when fetched via /elements/:uuid */
  found_in?: MiningCompositionRef[];
}

export interface MiningCompositionRef {
  composition_uuid: string;
  deposit_name: string;
  class_name: string;
  min_percentage: number;
  max_percentage: number;
  probability: number;
}

export interface MiningCompositionPart {
  element_uuid: string;
  element_name: string;
  instability: number | null;
  resistance: number | null;
  min_percentage: number;
  max_percentage: number;
  probability: number;
}

export interface MiningComposition {
  uuid: string;
  class_name: string;
  deposit_name: string;
  min_distinct_elements: number | null;
  element_count?: number;
  /** Only present when fetched via /compositions/:uuid */
  elements?: MiningCompositionPart[];
}

export interface MiningSolverResult {
  uuid: string;
  class_name: string;
  deposit_name: string;
  min_distinct_elements: number | null;
  element_name: string;
  instability: number | null;
  resistance: number | null;
  optimal_window_midpoint: number | null;
  optimal_window_thinness: number | null;
  explosion_multiplier: number | null;
  min_percentage: number;
  max_percentage: number;
  probability: number;
  curve_exponent: number | null;
}

export interface MiningStats {
  elements: number;
  compositions: number;
  parts: number;
}

// ─── Crafting ─────────────────────────────────────────────────────────────────
export interface CraftingRecipe {
  uuid: string;
  class_name: string;
  name: string | null;
  category: string | null;
  output_item_name: string | null;
  output_item_uuid: string | null;
  output_quantity: number;
  crafting_time_s: number | null;
  station_type: string | null;
  skill_level: number | null;
  game_env: string;
  ingredients?: CraftingIngredient[];
}

export interface CraftingIngredient {
  id: number;
  item_name: string;
  item_uuid: string | null;
  quantity: number;
  is_optional: boolean;
}

export interface CraftingCategory {
  category: string;
  count: number;
}

// ─── Trade ────────────────────────────────────────────────────────────────────
export interface TradeLocation {
  id: number;
  name: string;
  location: string | null;
  system: string | null;
  planet_moon: string | null;
  city: string | null;
  shop_type: string | null;
}

export interface CommodityPrice {
  id: number;
  buy_price: number | null;
  sell_price: number | null;
  reported_at: string;
  shop_id: number;
  shop_name: string;
  system: string | null;
  planet_moon: string | null;
  city: string | null;
}

export interface LocationCommodityPrice {
  id: number;
  commodity_uuid: string;
  commodity_name: string;
  commodity_type: string;
  symbol: string | null;
  occupancy_scu: number | null;
  buy_price: number | null;
  sell_price: number | null;
  reported_at: string;
}

export interface TradeRoute {
  buyCommodity: string;
  buyShop: string;
  buyLocation: string;
  buySystem: string | null;
  buyPrice: number;
  sellShop: string;
  sellLocation: string;
  sellSystem: string | null;
  sellPrice: number;
  profitPerUnit: number;
  profitPerScu: number;
  totalProfit: number;
  totalInvestment: number;
  scu: number;
}

// ─── Missions ─────────────────────────────────────────────────────────────────
export interface Mission {
  uuid: string;
  class_name: string;
  title: string | null;
  description: string | null;
  mission_type: string | null;
  can_be_shared: boolean;
  only_owner_complete: boolean;
  is_legal: boolean;
  completion_time_s: number | null;
  reward_min: number | null;
  reward_max: number | null;
  reward_currency: string | null;
  faction: string | null;
  mission_giver: string | null;
  location_system: string | null;
  location_planet: string | null;
  location_name: string | null;
  danger_level: number | null;
  required_reputation: number | null;
  reputation_reward: number | null;
  base_xp: number | null;
  category: string | null;
  is_unique: boolean;
  has_blueprint_reward: boolean;
}

export interface ChangelogEntry {
  id: number;
  entity_type: string;
  entity_uuid: string;
  entity_name: string;
  change_type: string;
  created_at: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  game_version: string | null;
}

export interface ChangelogSummary {
  total: number;
  by_entity: Record<string, number>;
  by_change: Record<string, number>;
  last_extraction: string | null;
}

// ─── Outfitter / Loadout calculator ──────────────────────────────────────────

export interface LoadoutPortEntry {
  port_id: number;
  port_name: string;
  port_type: string;
  port_min_size: number | null;
  port_max_size: number | null;
  component_uuid: string | null;
  component_name: string | null;
  display_name: string | null;
  component_type: string | null;
  component_size: number | null;
  grade: string | null;
  manufacturer_code: string | null;
  weapon_dps?: number | null;
  shield_hp?: number | null;
  power_output?: number | null;
  cooling_rate?: number | null;
  qd_speed?: number | null;
  swapped?: boolean;
}

// ─── Outfitter hardpoints (hierarchical) ─────────────────────────────────────
export interface HardpointComponent {
  port_id: number;
  port_name: string;
  uuid: string | null;
  name: string | null;
  display_name: string | null;
  type: string | null;
  sub_type: string | null;
  size: number | null;
  port_max_size: number | null;
  port_min_size: number | null;
  grade: string | null;
  manufacturer_code: string | null;
  hp: number | null;
  power_draw: number | null;
  heat_generation: number | null;
  weapon_dps?: number | null;
  weapon_burst_dps?: number | null;
  weapon_sustained_dps?: number | null;
  weapon_fire_rate?: number | null;
  weapon_range?: number | null;
  shield_hp?: number | null;
  shield_regen?: number | null;
  power_output?: number | null;
  cooling_rate?: number | null;
  qd_speed?: number | null;
  qd_range?: number | null;
  qd_spool_time?: number | null;
  missile_damage?: number | null;
  missile_signal_type?: string | null;
  cm_ammo?: number | null;
  radar_range?: number | null;
  sub_items?: HardpointComponent[];
  swapped?: boolean;
}

export interface HardpointEntry {
  port_id: number;
  port_name: string;
  display_name: string;
  category: string;
  port_min_size: number | null;
  port_max_size: number | null;
  mount_type: string | null;
  mount_class_name: string | null;
  mount_size: number | null;
  component: HardpointComponent | null;
  items: HardpointComponent[];
  swapped?: boolean;
}

export interface LoadoutResult {
  ship: { uuid: string; name: string; class_name: string };
  swaps: number;
  stats: {
    weapons: { count: number; total_dps: number; total_burst_dps: number; total_sustained_dps: number };
    shields: { count: number; total_hp: number; total_regen: number; time_to_charge: number };
    missiles: { count: number; total_damage: number };
    power: { total_draw: number; total_output: number; balance: number };
    thermal: { total_heat_generation: number; total_cooling_rate: number; balance: number };
    quantum: { drive_name: string; speed: number; spool_time: number; range: number };
    mobility: { scm_speed: number; max_speed: number; boost_forward: number; pitch: number; yaw: number; roll: number; mass: number };
    hull: { total_hp: number; ehp: number };
    fuel: { hydrogen: number; quantum: number };
    signatures: { ir: number; em: number; cs: number };
    armor: { physical: number; energy: number; distortion: number };
    countermeasures: { flare_count: number; chaff_count: number };
  };
  hardpoints: HardpointEntry[];
  loadout: LoadoutPortEntry[];
  modules: unknown[];
  paints: unknown[];
}

// ─── Compatible components (Outfitter picker) ─────────────────────────────────
export interface CompatibleComponent {
  uuid: string;
  class_name: string;
  name: string;
  type: string;
  sub_type: string | null;
  size: number | null;
  grade: string | null;
  manufacturer_code: string | null;
  manufacturer_name: string | null;
  weapon_dps: number | null;
  weapon_burst_dps: number | null;
  shield_hp: number | null;
  qd_speed: number | null;
  power_output: number | null;
  cooling_rate: number | null;
}

// ─── Item / Component buy locations (FPS) ─────────────────────────────────────
export interface ItemBuyLocation {
  shop_id: number;
  shop_name: string;
  location: string | null;
  system_name: string | null;
  city: string | null;
  shop_type: string | null;
  shop_source_type?: string | null;
  shop_source_name?: string | null;
  inventory_source_type?: string | null;
  inventory_source_name?: string | null;
  canonical_shop_key?: string | null;
  canonical_location_key?: string | null;
  confidence_score?: number | null;
  base_price: number | null;
  rental_price_1d: number | null;
}

// ─── Search ───────────────────────────────────────────────────────────────────
export interface SearchResultEntity {
  uuid: string;
  class_name?: string;
  name: string;
  type?: string;
  sub_type?: string;
}

export interface SearchResult {
  ships: ShipListItem[];
  components: ComponentListItem[];
  items: ItemListItem[];
  commodities: SearchResultEntity[];
  missions: SearchResultEntity[];
  recipes: SearchResultEntity[];
}

// ─── Hardpoints ───────────────────────────────────────────────────────────────
export interface Hardpoint {
  uuid: string;
  parts_name: string;
  port_type: string;
  port_size: number | null;
  component_uuid: string | null;
  component_name: string | null;
}

// ─── Compare ──────────────────────────────────────────────────────────────────
export interface ShipDelta {
  ship1: number;
  ship2: number;
  diff: number;
  pct: string;
}

export interface ShipComparison {
  ship1: { uuid: string; name: string; class_name: string; manufacturer_code: string | null };
  ship2: { uuid: string; name: string; class_name: string; manufacturer_code: string | null };
  comparison: Record<string, ShipDelta>;
  full: { ship1: Ship; ship2: Ship };
}

// ─── Ship Modules ─────────────────────────────────────────────────────────────
export interface ShipModule {
  id: number;
  ship_uuid: string;
  slot_name: string;
  slot_display_name: string | null;
  slot_type: string | null;
  module_class_name: string;
  module_name: string | null;
  module_tier: number | null;
  module_uuid: string | null;
  is_default: boolean;
  loadout_json: LoadoutNode[] | null;
}

// ─── Calculator results ───────────────────────────────────────────────────────
export interface FpsDamageResult {
  baseDamage: number;
  baseRpm: number;
  effectiveRpm: number;
  reductionPct: number;
  damagePerShot: number;
  sustainedDps: number;
  burstDps: number;
  shotsToKill: number;
  ttk: number;
  timeline: number[];
  activeModifiers: string[];
  magazineSize: number | null;
  effectiveRange: number | null;
  damagePhysical: number;
  damageEnergy: number;
  damageDistortion: number;
}

export interface MiningElementYield {
  elementName: string;
  elementUuid: string;
  probability: number;
  baseYield: number;
  optimizedYield: number;
  optimalWindow: number;
  windowStart: number;
  windowEnd: number;
}

export interface MiningRiskAggregates {
  maxInstability: number;
  avgInstability: number;
  maxResistance: number;
  avgResistance: number;
}

export interface MiningLaserInfo {
  uuid: string;
  name: string;
  size: number | null;
  grade: string | null;
  manufacturerCode: string | null;
  manufacturerName?: string | null;
  miningSpeed: number;
  miningRange: number;
  miningResistance: number;
  miningInstability: number;
}

export interface MiningYieldResult {
  compositionName: string;
  elements: MiningElementYield[];
  risk: MiningRiskAggregates | null;
  laser: MiningLaserInfo | null;
  gadgets: MiningLaserInfo[];
}
