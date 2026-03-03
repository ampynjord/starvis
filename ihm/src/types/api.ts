// ─── Pagination ──────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
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
  manufacturer: string;
  manufacturer_code: string;
  role: string | null;
  career: string | null;
  size: number | null;
  crew_min: number | null;
  crew_max: number | null;
  mass: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  scm_speed: number | null;
  afterburner_speed: number | null;
  quantum_speed: number | null;
  has_sm_link: boolean;
  variant_type: string | null;
  focus: string | null;
}

export interface Ship extends ShipListItem {
  pledge_cost: number | null;
  insurance_claim_time: number | null;
  insurance_expedite_cost: number | null;
  insurance_expedite_time: number | null;
  pitch: number | null;
  yaw: number | null;
  roll: number | null;
  max_shield: number | null;
  number_of_exits: number | null;
  cargocapacity: number | null;
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
  uuid: string;
  name: string;
  description: string | null;
  ship_uuid: string;
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
  sizes: number[];
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
  ships_count: number;
  components_count: number;
}

// ─── Commodities ──────────────────────────────────────────────────────────────
export interface Commodity {
  uuid: string;
  name: string;
  type: string | null;
  sub_type: string | null;
  description: string | null;
  buy_price: number | null;
  sell_price: number | null;
  is_illegal: boolean;
  is_raw: boolean;
}

// ─── Shops ────────────────────────────────────────────────────────────────────
export interface Shop {
  id: number;
  name: string;
  location: string;
  system: string | null;
  city: string | null;
  terminal: string | null;
  type: string | null;
}

// ─── Changelog ────────────────────────────────────────────────────────────────
export interface ChangelogEntry {
  id: number;
  entity_type: string;
  entity_uuid: string;
  entity_name: string;
  change_type: string;
  changed_at: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
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
