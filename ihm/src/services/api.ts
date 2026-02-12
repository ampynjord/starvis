/**
 * Starvis API Client — typed fetch wrapper for all endpoints
 */

const BASE = import.meta.env.VITE_API_URL || '/api/v1'

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
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
  career: string
  role: string
  mass: number
  total_hp: number
  scm_speed: number
  max_speed: number
  boost_speed_forward: number
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
  [key: string]: any
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
  [key: string]: any
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
    weapons: { count: number; total_dps: number; total_burst_dps: number; total_sustained_dps: number }
    shields: { total_hp: number; total_regen: number }
    missiles: { count: number; total_damage: number }
    power: { total_draw: number; total_output: number; balance: number }
    thermal: { total_heat_generation: number; total_cooling_rate: number; balance: number }
    quantum: { drive_name: string; speed: number; spool_time: number; fuel_capacity: number }
    countermeasures: { flare_count: number; chaff_count: number; details: { port_name: string; name: string; type: string; ammo_count: number }[] }
    signatures: { ir: number; em: number; cs: number }
    armor: { physical: number; energy: number; distortion: number; thermal: number }
    mobility: { scm_speed: number; max_speed: number; boost_forward: number; boost_backward: number; pitch: number; yaw: number; roll: number; mass: number }
    fuel: { hydrogen: number; quantum: number }
    hull: { total_hp: number; ehp: number; cross_section_x: number; cross_section_y: number; cross_section_z: number }
  }
  loadout: { port_name: string; port_type: string; component_uuid: string; component_name: string; display_name?: string; component_type: string; component_size?: number; grade?: string; manufacturer_code?: string; cm_ammo?: number; radar_range?: number; swapped: boolean }[]
}

// --------------- Ships ---------------

export async function getShips(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return fetchJson<PaginatedResponse<Ship>>(`/ships?${qs}`)
}

export async function getShip(uuid: string) {
  return fetchJson<SingleResponse<Ship>>(`/ships/${uuid}`)
}

export async function getShipLoadout(uuid: string) {
  return fetchJson<any>(`/ships/${uuid}/loadout`)
}

export async function getShipModules(uuid: string) {
  return fetchJson<any>(`/ships/${uuid}/modules`)
}

export async function compareShips(uuid1: string, uuid2: string) {
  return fetchJson<any>(`/ships/${uuid1}/compare/${uuid2}`)
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
  return fetchJson<any>(`/components/${uuid}/buy-locations`)
}

// --------------- Shops ---------------

export async function getShops(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return fetchJson<PaginatedResponse<Shop>>(`/shops?${qs}`)
}

export async function getShopInventory(shopId: number) {
  return fetchJson<any>(`/shops/${shopId}/inventory`)
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
  return fetchJson<any>(`/changelog?${qs}`)
}

// --------------- Version ---------------

export async function getVersion() {
  return fetchJson<any>('/version')
}
