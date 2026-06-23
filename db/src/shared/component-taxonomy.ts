export const GAME_COMPONENT_CATEGORIES = [
  'Ordnance',
  'Coolers',
  'EMP',
  'QI',
  'Utility',
  'Ordnance Racks',
  'Power Plants',
  'Quantum Drives',
  'Shields',
  'Turrets',
  'Weapons',
  'CM',
  'Liveries',
  'Jump Modules',
  'Radar',
] as const;

export type GameComponentCategory = (typeof GAME_COMPONENT_CATEGORIES)[number];

export const GAME_COMPONENT_CATEGORY_TYPES: Record<GameComponentCategory, string[]> = {
  Ordnance: ['Missile', 'WeaponMissile', 'Torpedo', 'Bomb', 'Rocket'],
  Coolers: ['Cooler'],
  EMP: ['EMP'],
  QI: ['QuantumInterdictionGenerator'],
  Utility: ['MiningLaser', 'MiningArm', 'MiningModifier', 'SalvageHead', 'TractorBeam', 'RepairBeam'],
  'Ordnance Racks': ['MissileRack', 'TorpedoRack', 'BombRack', 'RocketPod'],
  'Power Plants': ['PowerPlant'],
  'Quantum Drives': ['QuantumDrive'],
  Shields: ['Shield'],
  Turrets: ['Turret', 'TurretBase', 'TurretUnmanned'],
  Weapons: ['WeaponGun', 'Weapon', 'UtilityWeapon'],
  CM: ['Countermeasure'],
  Liveries: ['Paint', 'Livery'],
  'Jump Modules': ['JumpModule', 'JumpDrive'],
  Radar: ['Radar'],
};

const COMPONENT_TYPE_TO_GAME_CATEGORY = Object.fromEntries(
  Object.entries(GAME_COMPONENT_CATEGORY_TYPES).flatMap(([category, types]) => types.map((type) => [type, category])),
) as Record<string, GameComponentCategory>;

export function getGameComponentCategory(type?: string | null): GameComponentCategory | 'Other' {
  if (!type) return 'Other';
  return COMPONENT_TYPE_TO_GAME_CATEGORY[type] ?? 'Other';
}
