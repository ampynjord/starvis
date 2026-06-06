const GAME_COMPONENT_CATEGORY_TYPES = {
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
} as const;

const COMPONENT_TYPE_TO_GAME_CATEGORY = Object.fromEntries(
  Object.entries(GAME_COMPONENT_CATEGORY_TYPES).flatMap(([category, types]) => types.map((type) => [type, category])),
) as Record<string, string>;

export function getGameComponentCategory(type?: string | null): string {
  if (!type) return 'Other';
  return COMPONENT_TYPE_TO_GAME_CATEGORY[type] ?? 'Other';
}
