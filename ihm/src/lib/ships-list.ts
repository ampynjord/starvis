/**
 * Paramètres de la liste des vaisseaux, partagés entre la page serveur et la vue.
 *
 * La page serveur ne peut amorcer la vue que si les deux s'accordent exactement
 * sur ce qu'est « la première page par défaut ». Dupliquer ces valeurs des deux
 * côtés les ferait diverger à la première évolution — d'où cette source unique.
 */

export const SHIPS_LIST_LIMIT = 24;
export const DEFAULT_SHIP_SORT = 'name';
export const DEFAULT_SHIP_ORDER = 'asc';

export const SHIP_CATEGORIES = [
  { value: 'ship', label: 'Ships' },
  { value: 'ground', label: 'Ground Vehicles' },
  { value: 'gravlev', label: 'Grav-Lev' },
] as const;

export type ShipCategory = (typeof SHIP_CATEGORIES)[number]['value'];

/** Catégorie demandée via `?cat=`, ramenée à une valeur connue. */
export function resolveShipCategory(raw: string | undefined | null): ShipCategory {
  return SHIP_CATEGORIES.find((c) => c.value === raw)?.value ?? 'ship';
}

/** L'API expose les véhicules terrestres et grav-lev sur des chemins distincts. */
export function shipListPath(category: ShipCategory): string {
  if (category === 'ground') return '/ground-vehicles';
  if (category === 'gravlev') return '/gravlev';
  return '/ships';
}
