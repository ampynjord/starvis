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
  'organizations',
  'rsi-content',
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
  { id: 'organizations', runtime: 'network', aliases: ['organization', 'organisation', 'organisations', 'orgs'] },
  { id: 'rsi-content', runtime: 'network', aliases: ['rsi-html', 'enrich-content', 'comm-link-html', 'galactapedia-html'] },
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
