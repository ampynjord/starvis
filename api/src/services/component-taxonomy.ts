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

export const GAME_COMPONENT_CATEGORY_SLUGS: Record<string, GameComponentCategory> = Object.fromEntries(
  GAME_COMPONENT_CATEGORIES.flatMap((category) => [
    [slugifyGameComponentCategory(category), category],
    [category, category],
    [category.toLowerCase(), category],
  ]),
) as Record<string, GameComponentCategory>;

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
