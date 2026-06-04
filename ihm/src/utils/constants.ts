export const API_BASE = '/api/v1';

export const GAME_COMPONENT_CATEGORIES = [
  'Ordnance',
  'Coolers',
  'EMP',
  'Mining',
  'Missile Racks',
  'Power Plants',
  'Quantum Drives',
  'Shields',
  'Turrets',
  'Weapons',
  'CM Launchers',
  'Liveries',
  'Jump Modules',
  'Radar',
] as const;

export type GameComponentCategory = (typeof GAME_COMPONENT_CATEGORIES)[number];

export const GAME_COMPONENT_CATEGORY_TYPES: Record<GameComponentCategory, string[]> = {
  Ordnance: ['Missile', 'WeaponMissile', 'Ammunition', 'Torpedo', 'Bomb'],
  Coolers: ['Cooler'],
  EMP: ['EMP', 'QuantumInterdictionGenerator'],
  Mining: ['MiningLaser', 'MiningArm', 'SalvageHead', 'TractorBeam', 'RepairBeam'],
  'Missile Racks': ['MissileRack'],
  'Power Plants': ['PowerPlant'],
  'Quantum Drives': ['QuantumDrive'],
  Shields: ['Shield'],
  Turrets: ['Turret', 'TurretBase', 'TurretUnmanned'],
  Weapons: ['WeaponGun', 'Weapon', 'UtilityWeapon'],
  'CM Launchers': ['Countermeasure'],
  Liveries: ['Paint', 'Livery'],
  'Jump Modules': ['JumpModule', 'JumpDrive'],
  Radar: ['Radar'],
};

export const GAME_COMPONENT_CATEGORY_ICONS: Record<GameComponentCategory | 'Other', string> = {
  Ordnance: '◇',
  Coolers: '❄',
  EMP: '⚡',
  Mining: '⌑',
  'Missile Racks': '⬡',
  'Power Plants': '⚡',
  'Quantum Drives': '⊛',
  Shields: '◉',
  Turrets: '⌖',
  Weapons: '▸',
  'CM Launchers': '✦',
  Liveries: '◈',
  'Jump Modules': '⇄',
  Radar: '◎',
  Other: '⚙',
};

const COMPONENT_TYPE_TO_GAME_CATEGORY = Object.fromEntries(
  GAME_COMPONENT_CATEGORIES.flatMap((category) => GAME_COMPONENT_CATEGORY_TYPES[category].map((type) => [type, category])),
) as Record<string, GameComponentCategory>;

export function getGameComponentCategory(type?: string | null): GameComponentCategory | 'Other' {
  if (!type) return 'Other';
  return COMPONENT_TYPE_TO_GAME_CATEGORY[type] ?? 'Other';
}

export const VARIANT_TYPE_LABELS: Record<string, string> = {
  standard: 'Standard',
  collector: 'Collector',
  wikelo: 'Wikelo',
  pyam_exec: 'PyAM / Exec',
};

/** Internal DB type → human-readable game label */
export const COMPONENT_TYPE_LABELS: Record<string, string> = {
  WeaponGun: 'Gun',
  Ammunition: 'Ammunition',
  WeaponMissile: 'Missile',
  Shield: 'Shield',
  QuantumDrive: 'Quantum Drive',
  PowerPlant: 'Power Plant',
  Cooler: 'Cooler',
  FuelTank: 'Fuel Tank',
  FuelIntake: 'Fuel Intake',
  Thruster: 'Thruster',
  Radar: 'Radar',
  Countermeasure: 'Countermeasure',
  EMP: 'EMP',
  MissileRack: 'Missile Rack',
  MiningLaser: 'Mining Laser',
  TractorBeam: 'Tractor Beam',
  SalvageHead: 'Salvage Head',
  LifeSupport: 'Life Support',
  QuantumInterdictionGenerator: 'Quantum Interdiction',
  JumpModule: 'Jump Module',
  ShipModule: 'Ship Module',
  Gimbal: 'Gimbal',
  Turret: 'Turret',
  TurretUnmanned: 'Unmanned Turret',
  Missile: 'Missile',
};

export const COMPONENT_TYPE_COLORS: Record<string, string> = {
  WeaponGun: 'text-red-400',
  Ammunition: 'text-orange-200',
  WeaponMissile: 'text-orange-400',
  Shield: 'text-blue-400',
  QuantumDrive: 'text-purple-400',
  PowerPlant: 'text-yellow-400',
  Cooler: 'text-cyan-400',
  FuelTank: 'text-green-400',
  FuelIntake: 'text-green-300',
  Thruster: 'text-amber-400',
  Radar: 'text-indigo-400',
  Countermeasure: 'text-teal-400',
  EMP: 'text-fuchsia-400',
  MissileRack: 'text-orange-300',
  MiningLaser: 'text-emerald-400',
  TractorBeam: 'text-sky-400',
  SalvageHead: 'text-lime-400',
  LifeSupport: 'text-rose-400',
  QuantumInterdictionGenerator: 'text-violet-400',
  JumpModule: 'text-indigo-300',
  ShipModule: 'text-slate-300',
  Gimbal: 'text-slate-400',
  Turret: 'text-red-300',
  TurretUnmanned: 'text-red-200',
  Missile: 'text-orange-400',
};

/** FPS item type → human-readable game label (matches SC inventory names) */
export const ITEM_TYPE_LABELS: Record<string, string> = {
  FPS_Weapon: 'Weapon',
  Armor: 'Armor',
  Undersuit: 'Undersuit',
  Clothing: 'Clothing',
  Gadget: 'Gadget',
  Tool: 'Tool',
  Consumable: 'Consumable',
  Attachment: 'Attachment',
  Magazine: 'Magazine',
};
