/**
 * Starvis API Client — typed fetch wrapper for all endpoints
 */

const BASE = import.meta.env.VITE_API_URL || '/api/v1'

async function fetchJson<T>(path: string, init?: RequestInit, retries = 2): Promise<T> {
  const headers: Record<string, string> = { ...init?.headers as Record<string, string> }
  // Only set Content-Type for requests with a body
  if (init?.body) {
    headers['Content-Type'] = 'application/json'
  }
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers,
        signal: init?.signal ?? AbortSignal.timeout(15_000),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      return res.json()
    } catch (e) {
      if (attempt === retries) throw e
      // Only retry on network / timeout errors, not on 4xx
      if (e instanceof Error && e.message.startsWith('HTTP ')) throw e
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
    }
  }
  throw new Error('Unexpected fetch error') // unreachable
}

// --------------- Types ---------------

export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  total: number
  page: number
  limit: number
  pages?: number
}

export interface SingleResponse<T> {
  success: boolean
  data: T
}

export interface Ship {
  uuid: string
  class_name: string
  name: string
  manufacturer_code: string
  manufacturer_name: string | null
  career: string
  role: string
  mass: number
  total_hp: number
  scm_speed: number
  max_speed: number
  boost_speed_forward: number
  boost_speed_backward: number
  pitch_max: number
  yaw_max: number
  roll_max: number
  hydrogen_fuel_capacity: number
  quantum_fuel_capacity: number
  cargo_capacity: number
  crew_size: number
  shield_hp: number
  missile_damage_total: number
  weapon_damage_total: number
  armor_physical: number
  armor_energy: number
  armor_distortion: number
  cross_section_x: number
  cross_section_y: number
  cross_section_z: number
  ship_matrix_id: number | null
  thumbnail: string | null
  thumbnail_large: string | null
  production_status: string | null
  is_concept_only: boolean
  sm_description: string | null
  store_url: string | null
  vehicle_category: string | null
  insurance_claim_time: number | null
  insurance_expedite_cost: number | null
  game_data: Record<string, unknown> | null
}

export interface Component {
  uuid: string
  class_name: string
  name: string
  type: string
  sub_type: string | null
  size: number
  grade: string
  manufacturer_code: string
  mass: number
  hp: number
  weapon_damage: number | null
  weapon_dps: number | null
  weapon_burst_dps: number | null
  weapon_sustained_dps: number | null
  weapon_fire_rate: number | null
  weapon_range: number | null
  weapon_damage_physical: number | null
  weapon_damage_energy: number | null
  weapon_damage_distortion: number | null
  shield_hp: number | null
  shield_regen: number | null
  qd_speed: number | null
  qd_spool_time: number | null
  power_output: number | null
  cooling_rate: number | null
  missile_damage: number | null
  missile_signal_type: string | null
  missile_lock_time: number | null
  missile_speed: number | null
  missile_range: number | null
  missile_damage_physical: number | null
  missile_damage_energy: number | null
  missile_damage_distortion: number | null
  thruster_max_thrust: number | null
  radar_range: number | null
  cm_ammo_count: number | null
  fuel_capacity: number | null
  emp_damage: number | null
  emp_radius: number | null
  qd_cooldown: number | null
  qd_fuel_rate: number | null
  qd_range: number | null
  power_draw: number | null
  heat_generation: number | null
}

export interface Shop {
  id: number
  name: string
  location: string | null
  parent_location: string | null
  shop_type: string | null
  class_name: string
}

export interface Manufacturer {
  code: string
  name: string
  description: string | null
  known_for: string | null
}

export interface LoadoutStats {
  ship: { uuid: string; name: string; class_name: string }
  swaps: number
  stats: {
    weapons: { count: number; total_dps: number; total_burst_dps: number; total_sustained_dps: number; details: Record<string, unknown>[] }
    shields: { total_hp: number; total_regen: number; time_to_charge?: number; details: Record<string, unknown>[] }
    missiles: { count: number; total_damage: number; details: Record<string, unknown>[] }
    power: { total_draw: number; total_output: number; balance: number; details: Record<string, unknown>[] }
    thermal: { total_heat_generation: number; total_cooling_rate: number; balance: number; details: Record<string, unknown>[] }
    quantum: { drive_name: string; speed: number; spool_time: number; cooldown: number; fuel_rate: number; range: number; tuning_rate: number; alignment_rate: number; disconnect_range: number; fuel_capacity: number }
    countermeasures: { flare_count: number; chaff_count: number; details: { port_name: string; name: string; type: string; ammo_count: number }[] }
    emp: { count: number; details: { port_name: string; name: string; size: number; damage: number; radius: number; charge_time: number; cooldown: number }[] }
    quantum_interdiction: { count: number; details: { port_name: string; name: string; size: number; jammer_range: number; snare_radius: number; charge_time: number; cooldown: number }[] }
    utility: { count: number; details: { port_name: string; name: string; size: number; utility_type: string; dps: number; damage: number; fire_rate: number; range: number }[] }
    signatures: { ir: number; em: number; cs: number }
    armor: { physical: number; energy: number; distortion: number; thermal: number }
    mobility: { scm_speed: number; max_speed: number; boost_forward: number; boost_backward: number; pitch: number; yaw: number; roll: number; mass: number }
    fuel: { hydrogen: number; quantum: number }
    hull: { total_hp: number; ehp: number; cross_section_x: number; cross_section_y: number; cross_section_z: number }
  }
  loadout: LoadoutItem[]
  modules?: { module_name?: string; name?: string; module_type?: string; type?: string }[]
  paints?: { paint_name?: string; paint_class_name?: string }[]
}

export interface LoadoutItem {
  port_name: string; port_type: string; component_uuid: string; component_name: string
  display_name?: string; component_type: string; component_size?: number
  grade?: string; manufacturer_code?: string; swapped: boolean
  // Conditional fields per component type
  weapon_dps?: number | null; weapon_range?: number | null
  shield_hp?: number | null; shield_regen?: number | null
  power_output?: number | null; cooling_rate?: number | null; qd_speed?: number | null
  cm_ammo?: number | null; radar_range?: number | null
  emp_damage?: number | null; emp_radius?: number | null
  qig_jammer_range?: number | null; qig_snare_radius?: number | null
  port_min_size?: number; port_max_size?: number; size?: number
  [key: string]: unknown
}

// --------------- Ships ---------------

export interface LoadoutPort {
  id: number
  port_name: string
  port_type: string
  component_class_name: string | null
  component_uuid: string | null
  component_name: string | null
  component_type: string | null
  sub_type: string | null
  component_size: number | null
  grade: string | null
  manufacturer_code: string | null
  parent_id: number | null
  children?: LoadoutPort[]  // recursive tree structure
}

export interface ShipModule {
  id: number
  ship_uuid: string
  slot_name: string
  slot_display_name: string | null
  module_class_name: string
  module_name: string | null
  module_uuid: string | null
  is_default: boolean
}

export interface ShipPaint {
  paint_class_name: string
  paint_name: string | null
  paint_uuid: string | null
}

export interface Paint {
  id: number
  ship_uuid: string
  paint_class_name: string
  paint_name: string | null
  paint_uuid: string | null
  ship_name: string | null
  ship_class_name: string | null
  manufacturer_name: string | null
  manufacturer_code: string | null
}

export interface CompareResult {
  ship1: { uuid: string; name: string; class_name: string; manufacturer_code: string }
  ship2: { uuid: string; name: string; class_name: string; manufacturer_code: string }
  comparison: Record<string, { ship1: number; ship2: number; diff: number; pct: string }>
  full: { ship1: Ship; ship2: Ship }
}

export interface BuyLocation {
  shop_name: string
  location: string | null
  parent_location: string | null
  shop_type: string | null
  base_price: number | null
  rental_price_1d: number | null
  rental_price_3d: number | null
  rental_price_7d: number | null
  rental_price_30d: number | null
}

export interface ShopInventoryItem {
  id: number
  shop_id: number
  component_uuid: string | null
  component_class_name: string
  component_name: string | null
  component_type: string | null
  component_size: number | null
  base_price: number | null
}

export interface ChangelogEntry {
  id: number
  extraction_id: number
  entity_type: string
  entity_uuid: string
  entity_name: string | null
  change_type: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  created_at: string
  game_version: string | null
  extraction_date: string | null
}

export interface VersionInfo {
  id: number
  extraction_hash: string
  game_version: string | null
  ships_count: number
  components_count: number
  manufacturers_count: number
  loadout_ports_count: number
  duration_ms: number | null
  status: string
  extracted_at: string
}

export async function getShips(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return fetchJson<PaginatedResponse<Ship>>(`/ships?${qs}`)
}

export async function getShip(uuid: string) {
  return fetchJson<SingleResponse<Ship>>(`/ships/${uuid}`)
}

export async function getShipLoadout(uuid: string) {
  return fetchJson<{ success: boolean; data: LoadoutPort[] }>(`/ships/${uuid}/loadout`)
}

export async function getShipModules(uuid: string) {
  return fetchJson<{ success: boolean; data: ShipModule[] }>(`/ships/${uuid}/modules`)
}

export async function getShipPaints(uuid: string) {
  return fetchJson<{ success: boolean; data: ShipPaint[] }>(`/ships/${uuid}/paints`)
}

export async function compareShips(uuid1: string, uuid2: string) {
  return fetchJson<{ success: boolean; data: CompareResult }>(`/ships/${uuid1}/compare/${uuid2}`)
}

export interface ShipManufacturer extends Manufacturer {
  ship_count: number
}

export interface ShipFilters {
  roles: string[]
  careers: string[]
}

export async function getShipManufacturers() {
  return fetchJson<{ success: boolean; count: number; data: ShipManufacturer[] }>('/ships/manufacturers')
}

export async function getShipFilters() {
  return fetchJson<{ success: boolean; data: ShipFilters }>('/ships/filters')
}

// --------------- Components ---------------

export async function getComponents(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return fetchJson<PaginatedResponse<Component>>(`/components?${qs}`)
}

export async function getComponent(uuid: string) {
  return fetchJson<SingleResponse<Component>>(`/components/${uuid}`)
}

export async function getComponentBuyLocations(uuid: string) {
  return fetchJson<{ success: boolean; count: number; data: BuyLocation[] }>(`/components/${uuid}/buy-locations`)
}

export interface ComponentShip {
  uuid: string
  name: string
  class_name: string
  manufacturer_code: string
  manufacturer_name: string | null
}

export async function getComponentShips(uuid: string) {
  return fetchJson<{ success: boolean; count: number; data: ComponentShip[] }>(`/components/${uuid}/ships`)
}

export interface ComponentFilters {
  types: string[]
  sub_types: string[]
  sizes: number[]
  grades: string[]
}

export async function getComponentFilters() {
  return fetchJson<{ success: boolean; data: ComponentFilters }>('/components/filters')
}

// --------------- Paints ---------------

export async function getPaints(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return fetchJson<PaginatedResponse<Paint>>(`/paints?${qs}`)
}

// --------------- Shops ---------------

export async function getShops(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return fetchJson<PaginatedResponse<Shop>>(`/shops?${qs}`)
}

export async function getShopInventory(shopId: number) {
  return fetchJson<{ success: boolean; count: number; data: ShopInventoryItem[] }>(`/shops/${shopId}/inventory`)
}

// --------------- Manufacturers ---------------

export async function getManufacturers() {
  return fetchJson<{ success: boolean; count: number; data: Manufacturer[] }>('/manufacturers')
}

// --------------- Loadout Simulator ---------------

export async function calculateLoadout(shipUuid: string, swaps: { portName: string; componentUuid: string }[] = []) {
  return fetchJson<SingleResponse<LoadoutStats>>('/loadout/calculate', {
    method: 'POST',
    body: JSON.stringify({ shipUuid, swaps }),
  })
}

// --------------- Changelog ---------------

export async function getChangelog(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return fetchJson<{ success: boolean; data: ChangelogEntry[]; total: number }>(`/changelog?${qs}`)
}

// --------------- Version ---------------

export async function getVersion() {
  return fetchJson<{ success: boolean; data: VersionInfo }>('/version')
}
