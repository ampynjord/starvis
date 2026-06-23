import {
  GAME_COMPONENT_CATEGORIES,
  GAME_COMPONENT_CATEGORY_TYPES,
  type GameComponentCategory,
  getGameComponentCategory,
} from '@starvis/db';

export { GAME_COMPONENT_CATEGORIES, GAME_COMPONENT_CATEGORY_TYPES, type GameComponentCategory, getGameComponentCategory };

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
