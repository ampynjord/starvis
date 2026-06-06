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

export const GAME_COMPONENT_CATEGORY_SLUGS: Record<string, GameComponentCategory> = Object.fromEntries(
  GAME_COMPONENT_CATEGORIES.flatMap((category) => [
    [slugifyGameComponentCategory(category), category],
    [category, category],
    [category.toLowerCase(), category],
  ]),
) as Record<string, GameComponentCategory>;

Object.assign(GAME_COMPONENT_CATEGORY_SLUGS, {
  mining: 'Utility',
  utility: 'Utility',
  'missile-racks': 'Ordnance Racks',
  'missile racks': 'Ordnance Racks',
  'Missile Racks': 'Ordnance Racks',
  'ordnance-racks': 'Ordnance Racks',
  'cm-launchers': 'CM',
  'cm launchers': 'CM',
  'CM Launchers': 'CM',
  countermeasures: 'CM',
  qed: 'QI',
});

const COMPONENT_TYPE_TO_GAME_CATEGORY = Object.fromEntries(
  GAME_COMPONENT_CATEGORIES.flatMap((category) => GAME_COMPONENT_CATEGORY_TYPES[category].map((type) => [type, category])),
) as Record<string, GameComponentCategory>;

export function getGameComponentCategory(type?: string | null): GameComponentCategory | 'Other' {
  if (!type) return 'Other';
  return COMPONENT_TYPE_TO_GAME_CATEGORY[type] ?? 'Other';
}

export function getGameComponentCategoryTypes(categoryOrSlug: string): string[] | undefined {
  const category = GAME_COMPONENT_CATEGORY_SLUGS[categoryOrSlug] ?? GAME_COMPONENT_CATEGORY_SLUGS[categoryOrSlug.toLowerCase()];
  return category ? GAME_COMPONENT_CATEGORY_TYPES[category] : undefined;
}

export function slugifyGameComponentCategory(category: string): string {
  return category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function gameComponentCategorySort(category?: string | null): number {
  const idx = GAME_COMPONENT_CATEGORIES.indexOf(category as GameComponentCategory);
  return idx === -1 ? 999 : idx;
}
