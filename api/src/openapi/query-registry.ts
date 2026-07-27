import {
  ChangelogQuery,
  CommodityQuery,
  ComponentQuery,
  GameVersionsQuery,
  ItemQuery,
  PaintQuery,
  SearchQuery,
  ShopQuery,
} from '../schemas.js';

/**
 * Routes dont les paramètres de requête sont validés par un schéma zod.
 *
 * Ce registre rend la correspondance route → schéma explicite, pour que la
 * documentation puisse être dérivée du code plutôt que maintenue en parallèle.
 * Il avait dérivé : `/api/v1/commodities` documentait un paramètre `is_illegal`
 * qu'aucun service n'a jamais traité, et taisait `types` et `category` qui le
 * sont réellement.
 *
 * Les chemins sont écrits au format OpenAPI (`{slug}` et non `:slug`).
 *
 * Ajouter une entrée ici étend la part générée du contrat ; le reste de
 * openapi.json demeure écrit à la main en attendant d'être couvert à son tour.
 */
export const QUERY_SCHEMA_REGISTRY = [
  { method: 'get', path: '/api/v1/commodities', schema: CommodityQuery },
  { method: 'get', path: '/api/v1/components', schema: ComponentQuery },
  { method: 'get', path: '/api/v1/items', schema: ItemQuery },
  { method: 'get', path: '/api/v1/items/category/{slug}', schema: ItemQuery },
  { method: 'get', path: '/api/v1/paints', schema: PaintQuery },
  { method: 'get', path: '/api/v1/search', schema: SearchQuery },
  { method: 'get', path: '/api/v1/ship-matrix', schema: SearchQuery },
  { method: 'get', path: '/api/v1/ships/search', schema: SearchQuery },
  { method: 'get', path: '/api/v1/shops', schema: ShopQuery },
  { method: 'get', path: '/api/v1/changelog', schema: ChangelogQuery },
  { method: 'get', path: '/api/v1/changelog/summary', schema: ChangelogQuery },
  { method: 'get', path: '/api/v1/game-versions', schema: GameVersionsQuery },
] as const;
