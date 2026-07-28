export const GAME_ENVS = ['live', 'ptu', 'custom'] as const;

export type GameEnv = (typeof GAME_ENVS)[number];

export const EXTRACTION_MODULES = [
  'ships',
  'components',
  'items',
  'commodities',
  'mining',
  'missions',
  'crafting',
  'paints',
  'shops',
  'locations',
  'game-insights',
  'ctm',
  'galactapedia',
  'comm-links',
  'starmap',
  'starmap-assets',
  'ship-matrix',
  'ship-galleries',
  'rsi-content',
  'uex',
] as const;

export type ExtractionModule = (typeof EXTRACTION_MODULES)[number];

export type ModuleRuntime = 'p4k' | 'network';

export interface ExtractionModuleDefinition {
  id: ExtractionModule;
  runtime: ModuleRuntime;
  aliases?: readonly string[];
}

export const MODULE_REGISTRY: readonly ExtractionModuleDefinition[] = [
  { id: 'ships', runtime: 'p4k' },
  { id: 'components', runtime: 'p4k' },
  { id: 'items', runtime: 'p4k' },
  { id: 'commodities', runtime: 'p4k' },
  { id: 'mining', runtime: 'p4k' },
  { id: 'missions', runtime: 'p4k' },
  { id: 'crafting', runtime: 'p4k' },
  { id: 'paints', runtime: 'p4k' },
  { id: 'shops', runtime: 'p4k', aliases: ['shop-inventory'] },
  { id: 'locations', runtime: 'p4k' },
  {
    id: 'game-insights',
    runtime: 'p4k',
    aliases: [
      'insight',
      'insights',
      'loot',
      'reputation',
      'reputations',
      'faction',
      'factions',
      'navigation',
      'environment',
      'environments',
      'service',
      'services',
      'medical',
      'fps-details',
    ],
  },
  { id: 'ctm', runtime: 'network' },
  { id: 'galactapedia', runtime: 'network' },
  { id: 'comm-links', runtime: 'network' },
  { id: 'starmap', runtime: 'network' },
  { id: 'starmap-assets', runtime: 'network', aliases: ['starmap-asset', 'ark-assets', 'ark-textures'] },
  { id: 'ship-matrix', runtime: 'network' },
  {
    id: 'ship-galleries',
    runtime: 'network',
    aliases: ['gallery', 'galleries', 'ship-gallery', 'official-gallery', 'official-galleries'],
  },
  { id: 'rsi-content', runtime: 'network', aliases: ['rsi-html', 'enrich-content', 'comm-link-html', 'galactapedia-html'] },
  { id: 'uex', runtime: 'network', aliases: ['uex-market', 'uexcorp', 'prices', 'market'] },
] as const;

export const VALID_MODULES = [...EXTRACTION_MODULES];

export const MODULE_ALIASES: ReadonlyMap<string, ExtractionModule> = new Map(
  MODULE_REGISTRY.flatMap((definition) => (definition.aliases ?? []).map((alias) => [alias, definition.id] as const)),
);

export const P4K_MODULES = new Set<ExtractionModule>(
  MODULE_REGISTRY.filter((module) => module.runtime === 'p4k').map((module) => module.id),
);

export const NETWORK_MODULES = new Set<ExtractionModule>(
  MODULE_REGISTRY.filter((module) => module.runtime === 'network').map((module) => module.id),
);

/**
 * Ce qu'une extraction efface avant d'ecrire.
 *
 * Ces lignes etaient jusqu'ici une suite de `DELETE` dans `cleanStaleGameData`.
 * Un mode `plan` fidele ne peut pas relire du code imperatif : il lui faut un
 * fait. Le nettoyage execute desormais cette table, et le plan l'affiche — les
 * deux ne peuvent plus diverger, puisqu'ils lisent la meme chose.
 *
 * **L'ordre est celui des dependances de cles etrangeres**, pas un ordre
 * alphabetique : les tables filles precedent leurs parents. Le reordonner
 * casserait le nettoyage.
 */
export interface ModuleDeletion {
  /** La suppression a lieu des qu'un seul de ces modules est selectionne. */
  readonly modules: readonly ExtractionModule[];
  readonly table: string;
  /** Les tables filles portent l'env de leur parent, sous un autre nom. */
  readonly envColumn: string;
}

export const MODULE_DELETIONS: readonly ModuleDeletion[] = [
  { modules: ['ships'], table: 'game.ship_modules', envColumn: 'env' },
  { modules: ['ships'], table: 'game.ship_loadouts', envColumn: 'env' },
  { modules: ['ships'], table: 'game.ships', envColumn: 'env' },
  { modules: ['components'], table: 'game.components', envColumn: 'env' },
  { modules: ['items', 'commodities'], table: 'game.items', envColumn: 'env' },
  { modules: ['items', 'commodities'], table: 'game.commodities', envColumn: 'env' },
  { modules: ['mining'], table: 'game.mining_composition_parts', envColumn: 'composition_env' },
  { modules: ['mining'], table: 'game.mining_compositions', envColumn: 'env' },
  { modules: ['mining'], table: 'game.mining_elements', envColumn: 'env' },
  { modules: ['missions'], table: 'game.mission_blueprint_rewards', envColumn: 'mission_env' },
  { modules: ['missions'], table: 'game.missions', envColumn: 'env' },
  { modules: ['crafting'], table: 'game.crafting_ingredients', envColumn: 'recipe_env' },
  { modules: ['crafting'], table: 'game.crafting_slot_modifiers', envColumn: 'recipe_env' },
  { modules: ['crafting'], table: 'game.crafting_recipes', envColumn: 'env' },
  { modules: ['locations'], table: 'game.locations', envColumn: 'env' },
  { modules: ['game-insights'], table: 'game.blueprint_rewards', envColumn: 'env' },
  { modules: ['game-insights'], table: 'game.loot_table_entries', envColumn: 'env' },
  { modules: ['game-insights'], table: 'game.loot_tables', envColumn: 'env' },
  { modules: ['game-insights'], table: 'game.loot_archetypes', envColumn: 'env' },
  { modules: ['game-insights'], table: 'game.reputation_scopes', envColumn: 'env' },
  { modules: ['game-insights'], table: 'game.reputation_standings', envColumn: 'env' },
  { modules: ['game-insights'], table: 'game.factions', envColumn: 'env' },
  { modules: ['game-insights'], table: 'game.ammo', envColumn: 'env' },
  { modules: ['game-insights'], table: 'game.inventory_containers', envColumn: 'env' },
  { modules: ['game-insights'], table: 'game.game_insights', envColumn: 'env' },
] as const;
