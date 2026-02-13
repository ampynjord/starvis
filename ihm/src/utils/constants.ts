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
}

/**
 * Component types to filter in the loadout manager view (user-swappable).
 */
export const LOADOUT_CATEGORY_ORDER = [
  'WeaponGun', 'Turret', 'TurretBase', 'MissileLauncher', 'MissileRack',
  'Missile', 'Shield', 'PowerPlant', 'Cooler', 'QuantumDrive',
  'Radar', 'EMP', 'QuantumInterdictionGenerator', 'Countermeasure',
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
