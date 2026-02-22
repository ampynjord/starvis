/**
 * Shared types, helpers and constants for game-data sub-services
 */
import type { RowDataPacket } from 'mysql2/promise';

// ── Types ─────────────────────────────────────────────────

/** A single row returned by mysql2 queries */
export type Row = RowDataPacket & Record<string, unknown>;

export interface PaginatedResult {
  data: Row[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ── Numeric helpers ───────────────────────────────────────

export const num = (v: unknown): number => parseFloat(String(v)) || 0;
export const int = (v: unknown): number => parseInt(String(v)) || 0;
export const r1 = (v: number): number => Math.round(v * 10) / 10;
export const r2 = (v: number): number => Math.round(v * 100) / 100;
export const r4 = (v: number): number => Math.round(v * 10000) / 10000;
export const r6 = (v: number): number => Math.round(v * 1000000) / 1000000;

// ── SQL constants ─────────────────────────────────────────

export const SHIP_SELECT = `s.uuid, s.class_name, COALESCE(sm.name, s.name) as name, s.manufacturer_code, m.name as manufacturer_name,
  s.career, s.role, s.mass, s.total_hp,
  s.scm_speed, s.max_speed, s.boost_speed_forward, s.boost_speed_backward,
  s.pitch_max, s.yaw_max, s.roll_max,
  s.hydrogen_fuel_capacity, s.quantum_fuel_capacity,
  s.cargo_capacity, s.crew_size, s.shield_hp,
  s.missile_damage_total, s.weapon_damage_total,
  s.armor_physical, s.armor_energy, s.armor_distortion,
  s.cross_section_x, s.cross_section_y, s.cross_section_z,
  s.ship_matrix_id,
  sm.media_store_small as thumbnail, sm.media_store_large as thumbnail_large,
  sm.production_status, sm.description as sm_description,
  sm.url as store_url, sm.cargocapacity as sm_cargo,
  s.vehicle_category, s.insurance_claim_time, s.insurance_expedite_cost,
  s.short_name, s.variant_type, s.game_data`;

/** Concept-only columns: ship_matrix entries without P4K data */
export const CONCEPT_SELECT = `CONCAT('concept-', sm2.id) as uuid, LOWER(REPLACE(REPLACE(sm2.name, ' ', '_'), '''', '')) as class_name,
  sm2.name, sm2.manufacturer_code, sm2.manufacturer_name as manufacturer_name,
  NULL as career, NULL as role, sm2.mass, NULL as total_hp,
  sm2.scm_speed, sm2.afterburner_speed as max_speed,
  NULL as boost_speed_forward, NULL as boost_speed_backward,
  sm2.pitch_max, sm2.yaw_max, sm2.roll_max,
  NULL as hydrogen_fuel_capacity, NULL as quantum_fuel_capacity,
  sm2.cargocapacity as cargo_capacity, sm2.min_crew as crew_size, NULL as shield_hp,
  NULL as missile_damage_total, NULL as weapon_damage_total,
  NULL as armor_physical, NULL as armor_energy, NULL as armor_distortion,
  NULL as cross_section_x, NULL as cross_section_y, NULL as cross_section_z,
  sm2.id as ship_matrix_id,
  sm2.media_store_small as thumbnail, sm2.media_store_large as thumbnail_large,
  sm2.production_status, sm2.description as sm_description,
  sm2.url as store_url, sm2.cargocapacity as sm_cargo,
  NULL as vehicle_category, NULL as insurance_claim_time, NULL as insurance_expedite_cost,
  NULL as short_name, NULL as variant_type, NULL as game_data`;

export const SHIP_JOINS = `FROM ships s
  LEFT JOIN manufacturers m ON s.manufacturer_code = m.code
  LEFT JOIN ship_matrix sm ON s.ship_matrix_id = sm.id`;

export const SHIP_SORT = new Set([
  'name',
  'class_name',
  'manufacturer_code',
  'mass',
  'scm_speed',
  'max_speed',
  'total_hp',
  'shield_hp',
  'crew_size',
  'cargo_capacity',
  'missile_damage_total',
  'weapon_damage_total',
  'armor_physical',
  'armor_energy',
  'armor_distortion',
  'cross_section_x',
  'cross_section_y',
  'cross_section_z',
  'hydrogen_fuel_capacity',
  'quantum_fuel_capacity',
  'boost_speed_forward',
  'pitch_max',
  'yaw_max',
  'roll_max',
]);

export const COMP_SORT = new Set([
  'name',
  'class_name',
  'type',
  'size',
  'grade',
  'manufacturer_code',
  'weapon_dps',
  'weapon_burst_dps',
  'weapon_sustained_dps',
  'weapon_damage',
  'weapon_fire_rate',
  'weapon_range',
  'weapon_damage_physical',
  'weapon_damage_energy',
  'weapon_damage_distortion',
  'shield_hp',
  'shield_regen',
  'qd_speed',
  'qd_spool_time',
  'power_output',
  'cooling_rate',
  'hp',
  'mass',
  'thruster_max_thrust',
  'radar_range',
  'fuel_capacity',
]);

export const UTILITY_WEAPON_RX = /tractor|mining|salvage|repair|grin_tractor|grin_salvage/i;

export const RELEVANT_TYPES = new Set([
  'WeaponGun',
  'Shield',
  'PowerPlant',
  'Cooler',
  'QuantumDrive',
  'Countermeasure',
  'Missile',
  'Radar',
  'EMP',
  'QuantumInterdictionGenerator',
]);

// ── String helpers ────────────────────────────────────────

/** Detect utility weapon sub-type from name/class_name */
export function detectUtilityType(name: string, className: string): string {
  const s = `${name} ${className}`.toLowerCase();
  if (/mining|orion_mining/i.test(s)) return 'MiningLaser';
  if (/salvage|reclaim/i.test(s)) return 'SalvageHead';
  if (/tractor|grin_tractor/i.test(s)) return 'TractorBeam';
  if (/repair/i.test(s)) return 'RepairBeam';
  return 'UtilityWeapon';
}

export function cleanName(name: string, type: string): string {
  if (!name) return '—';
  let c = name;
  if (['Shield', 'QuantumDrive', 'PowerPlant', 'Cooler', 'Radar', 'Missile'].includes(type)) c = c.replace(/^S\d{2}\s+/, '');
  if (type === 'Countermeasure') {
    const m = c.match(/(CML\s+.+)/i);
    if (m) c = m[1];
  }
  c = c.replace(/\s*SCItem.*$/i, '').replace(/\s*_Resist.*$/i, '');
  return c.trim() || '—';
}

// ── Pagination helper ─────────────────────────────────────

import type { Pool } from 'mysql2/promise';

export async function paginate(
  pool: Pool,
  baseSql: string,
  countSql: string,
  params: (string | number)[],
  opts: { sort?: string; order?: string; page?: number; limit?: number },
  sortCols: Set<string>,
  alias: string,
): Promise<PaginatedResult> {
  const [countRows] = await pool.execute<Row[]>(countSql, params);
  const total = countRows[0]?.total ?? countRows[0]?.count ?? 0;

  const sortCol = sortCols.has(opts.sort || '') ? opts.sort! : 'name';
  const order = opts.order === 'desc' ? 'DESC' : 'ASC';
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(200, Math.max(1, opts.limit || 50));
  const offset = (page - 1) * limit;

  const sql = `${baseSql} ORDER BY ${alias}.${sortCol} ${order} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
  const [rows] = await pool.execute<Row[]>(sql, params);
  return { data: rows, total: Number(total), page, limit, pages: Math.ceil(Number(total) / limit) };
}
