/**
 * Shared component category definitions used across STARVIS views.
 */

export interface CategoryInfo {
  label: string
  icon: string
  color: string
  tailwindColor: string
  order: number
}

/**
 * Variant type display labels and badge styles.
 * Maps DB variant_type values → human-readable labels + badge CSS.
 */
export const VARIANT_TYPE_MAP: Record<string, { label: string; badge: string; icon: string }> = {
  collector:   { label: 'Collector',     badge: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',       icon: '🏆' },
  exec:        { label: 'Executive',     badge: 'bg-violet-500/20 text-violet-400 border border-violet-500/30',     icon: '👔' },
  bis_edition: { label: 'BIS Edition',   badge: 'bg-sky-500/20 text-sky-400 border border-sky-500/30',              icon: '🌟' },
  tutorial:    { label: 'Tutorial',      badge: 'bg-teal-500/20 text-teal-400 border border-teal-500/30',           icon: '📘' },
  enemy_ai:    { label: 'NPC',           badge: 'bg-red-500/20 text-red-400 border border-red-500/30',              icon: '🤖' },
  military:    { label: 'Military',      badge: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',  icon: '🎖️' },
  event:       { label: 'Event',         badge: 'bg-pink-500/20 text-pink-400 border border-pink-500/30',           icon: '🎉' },
  pirate:      { label: 'Pirate',        badge: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',     icon: '☠️' },
  arena_ai:    { label: 'Arena AI',      badge: 'bg-red-500/20 text-red-400 border border-red-500/30',              icon: '🤖' },
  special:     { label: 'Special',       badge: 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30',     icon: '✨' },
}

/**
 * Get variant type display info with fallback.
 */
export function getVariantInfo(variantType: string | null | undefined): { label: string; badge: string; icon: string } | null {
  if (!variantType) return null
  return VARIANT_TYPE_MAP[variantType] || { label: variantType, badge: 'bg-gray-500/20 text-gray-400 border border-gray-500/30', icon: '🏷️' }
}

/**
 * Comprehensive component type → category mapping.
 * Covers all known P4K component types and their display metadata.
 */
export const CATEGORY_MAP: Record<string, CategoryInfo> = {
  // Weapons
  WeaponGun:        { label: 'Weapons',         icon: '🎯', color: 'red',    tailwindColor: 'text-red-400',    order: 1 },
  Weapon:           { label: 'Weapons',         icon: '🎯', color: 'red',    tailwindColor: 'text-red-400',    order: 1 },
  Gimbal:           { label: 'Weapons',         icon: '🎯', color: 'red',    tailwindColor: 'text-red-400',    order: 1 },
  // Turrets
  TurretBase:       { label: 'Turrets',         icon: '🔫', color: 'red',    tailwindColor: 'text-red-400',    order: 2 },
  Turret:           { label: 'Turrets',         icon: '🔫', color: 'red',    tailwindColor: 'text-red-400',    order: 2 },
  // Missiles
  MissileLauncher:  { label: 'Missiles',        icon: '🚀', color: 'orange', tailwindColor: 'text-amber-400',  order: 3 },
  MissileRack:      { label: 'Missiles',        icon: '🚀', color: 'orange', tailwindColor: 'text-amber-400',  order: 3 },
  Missile:          { label: 'Missiles',        icon: '🚀', color: 'orange', tailwindColor: 'text-amber-400',  order: 3 },
  // Shields
  Shield:           { label: 'Shields',         icon: '🛡️', color: 'blue',   tailwindColor: 'text-blue-400',   order: 4 },
  ShieldGenerator:  { label: 'Shields',         icon: '🛡️', color: 'blue',   tailwindColor: 'text-blue-400',   order: 4 },
  // Power
  PowerPlant:       { label: 'Power Plants',    icon: '⚡', color: 'yellow', tailwindColor: 'text-yellow-400', order: 5 },
  // Coolers
  Cooler:           { label: 'Coolers',         icon: '❄️', color: 'cyan',   tailwindColor: 'text-cyan-400',   order: 6 },
  // Quantum
  QuantumDrive:     { label: 'Quantum Drive',   icon: '💫', color: 'purple', tailwindColor: 'text-purple-400', order: 7 },
  // Radar
  Radar:            { label: 'Radar',           icon: '📡', color: 'green',  tailwindColor: 'text-green-400',  order: 8 },
  // EMP
  EMP:              { label: 'EMP',             icon: '⚡', color: 'purple', tailwindColor: 'text-purple-400', order: 9 },
  // Thrusters
  MainThruster:     { label: 'Thrusters',       icon: '🔥', color: 'orange', tailwindColor: 'text-amber-400',  order: 10 },
  ManneuverThruster:{ label: 'Thrusters',       icon: '🔥', color: 'orange', tailwindColor: 'text-amber-400',  order: 10 },
  Thruster:         { label: 'Thrusters',       icon: '🔥', color: 'orange', tailwindColor: 'text-amber-400',  order: 10 },
  // QED
  QuantumInterdictionGenerator:
                    { label: 'QED',             icon: '🔒', color: 'purple', tailwindColor: 'text-purple-400', order: 11 },
  // Countermeasures
  Countermeasure:   { label: 'Countermeasures', icon: '🎇', color: 'emerald',tailwindColor: 'text-emerald-400',order: 12 },
  // Utility weapons (mining, salvage, tractor, repair)
  MiningLaser:      { label: 'Mining Lasers',   icon: '⛏️', color: 'amber',  tailwindColor: 'text-amber-400',  order: 13 },
  SalvageHead:      { label: 'Salvage Heads',   icon: '♻️', color: 'lime',   tailwindColor: 'text-lime-400',   order: 14 },
  TractorBeam:      { label: 'Tractor Beams',   icon: '🧲', color: 'sky',    tailwindColor: 'text-sky-400',    order: 15 },
  RepairBeam:       { label: 'Repair Beams',    icon: '🔧', color: 'teal',   tailwindColor: 'text-teal-400',   order: 16 },
  UtilityWeapon:    { label: 'Utility',         icon: '🔧', color: 'gray',   tailwindColor: 'text-gray-400',   order: 17 },
}

/**
 * Component types to filter in the loadout manager view (user-swappable).
 */
export const LOADOUT_CATEGORY_ORDER = [
  'WeaponGun', 'Turret', 'TurretBase', 'MissileLauncher', 'MissileRack',
  'Missile', 'Shield', 'PowerPlant', 'Cooler', 'QuantumDrive',
  'Radar', 'EMP', 'QuantumInterdictionGenerator', 'Countermeasure',
  'MiningLaser', 'SalvageHead', 'TractorBeam', 'RepairBeam', 'UtilityWeapon',
]

/**
 * Component types for the component browser filter tabs.
 */
export const COMPONENT_TYPES = [
  'WeaponGun', 'Shield', 'QuantumDrive', 'PowerPlant',
  'Cooler', 'Radar', 'Countermeasure', 'Thruster',
]

/**
 * Component types to hide from ship detail pages (internal/structural).
 */
export const HIDDEN_PORT_TYPES = new Set([
  'FuelIntake', 'FuelTank', 'QuantumFuelTank', 'HydrogenFuelTank',
  'LifeSupport', 'FlightController', 'SelfDestruct', 'Transponder',
  'Scanner', 'Ping', 'Armor', 'Light', 'LandingGear', 'Door',
  'Seat', 'Container', 'WeaponRack',
])

/**
 * Port names to hide from loadout displays (internal/structural ports).
 */
export const HIDDEN_PORT_NAMES = new Set([
  'controller', 'display', 'screen', 'mfd', 'seat', 'door',
  'elevator', 'ramp', 'light', 'flair', 'paint', 'docking',
  'helper', 'landing', 'fuelport', 'relay', 'skylight',
  'annunciator', 'emergency', 'cargo', 'engineering',
  'air_traffic', 'cockpit_flair', 'slot_fuse', '$slot',
])

/**
 * Get category info for a component type, with fallback.
 */
export function getCategoryInfo(type: string): CategoryInfo {
  return CATEGORY_MAP[type] || {
    label: type,
    icon: '📦',
    color: 'gray',
    tailwindColor: 'text-gray-400',
    order: 99,
  }
}
