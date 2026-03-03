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
  cross_section_x: number | null;   // width
  cross_section_y: number | null;   // height
  cross_section_z: number | null;   // length
  scm_speed: number | null;
  max_speed: number | null;
  boost_speed_forward: number | null;
  cargo_capacity: number | null;
  ship_matrix_id: number | null;    // non-null = has RSI SM link
  thumbnail: string | null;
  production_status: string | null;
  variant_type: string | null;
  is_concept_only: boolean;
}

export interface Ship extends ShipListItem {
  pitch_max: number | null;
  yaw_max: number | null;
  roll_max: number | null;
  shield_hp: number | null;
  total_hp: number | null;
  hydrogen_fuel_capacity: number | null;
  quantum_fuel_capacity: number | null;
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
}

export interface LoadoutNode {
  partsName: string;
  portType: string;
  portSize: number;
  portFlags: string[];
  component: {
    uuid: string;
    name: string;
    type: string;
    sub_type: string;
    size: number;
    manufacturer_code: string;
  } | null;
  children: LoadoutNode[];
}

export interface ShipPaint {
  paint_uuid: string;
  paint_name: string;
  paint_class_name: string;
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
  name: string;
  type: string;
  sub_type: string | null;
  size: number | null;
  grade: string | null;
  class: string | null;
  manufacturer_code: string | null;
  manufacturer_name: string | null;
  description: string | null;
}

export interface Component extends ComponentListItem {
  mass: number | null;
  hp: number | null;
  power_base: number | null;
  power_draw: number | null;
  heat_generation: number | null;
  em_signature: number | null;
  ir_signature: number | null;
  cross_section_signature: number | null;
  game_data: Record<string, unknown> | null;
}

export interface BuyLocation {
  shop_id: number;
  shop_name: string;
  location: string;
  system: string | null;
  city: string | null;
  terminal: string | null;
  base_price: number | null;
  inventory: number | null;
}

// ─── Items ─────────────────────────────────────────────────────────────────────
export interface ItemListItem {
  uuid: string;
  name: string;
  type: string;
  sub_type: string | null;
  size: number | null;
  grade: string | null;
  manufacturer_code: string | null;
  manufacturer_name: string | null;
  description: string | null;
}

export interface Item extends ItemListItem {
  mass: number | null;
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
  type: string | null;
  sub_type: string | null;
  symbol: string | null;
  occupancy_scu: number | null;
}

// ─── Shops ────────────────────────────────────────────────────────────────────
export interface Shop {
  id: number;
  name: string;
  location: string | null;
  parent_location: string | null;
  system: string | null;
  planet_moon: string | null;
  city: string | null;
  shop_type: string | null;
  class_name: string;
}

// ─── Changelog ────────────────────────────────────────────────────────────────
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

// ─── Search ───────────────────────────────────────────────────────────────────
export interface SearchResult {
  ships: ShipListItem[];
  components: ComponentListItem[];
  items: ItemListItem[];
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
export interface ShipComparison {
  ship1: Ship;
  ship2: Ship;
  deltas: Record<string, { ship1: number | null; ship2: number | null; delta: number | null; better: 'ship1' | 'ship2' | 'equal' | null }>;
}
