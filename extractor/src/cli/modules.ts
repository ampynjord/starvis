import type { ExtractionModule, GameEnv } from '../extraction-service.js';

export const GAME_ENVS = ['live', 'ptu', 'custom'] as const satisfies readonly GameEnv[];

export const VALID_MODULES: ExtractionModule[] = [
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
  'ship-matrix',
  'organizations',
];

export const MODULE_ALIASES: Partial<Record<string, ExtractionModule>> = {
  organisations: 'organizations',
  organization: 'organizations',
  organisation: 'organizations',
  orgs: 'organizations',
  insights: 'game-insights',
  insight: 'game-insights',
  loot: 'game-insights',
  reputation: 'game-insights',
  reputations: 'game-insights',
  factions: 'game-insights',
  faction: 'game-insights',
  navigation: 'game-insights',
  environment: 'game-insights',
  environments: 'game-insights',
  services: 'game-insights',
  service: 'game-insights',
  medical: 'game-insights',
  'fps-details': 'game-insights',
  'shop-inventory': 'game-insights',
};

export const P4K_FREE_MODULES = new Set<ExtractionModule>(['ctm', 'galactapedia', 'comm-links', 'starmap', 'ship-matrix', 'organizations']);
export const RSI_MODULES = new Set<ExtractionModule>(['galactapedia', 'comm-links', 'starmap', 'ship-matrix', 'organizations']);

export type SelectedModules = Set<ExtractionModule | 'all'>;

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

export function parseModules(value: string): SelectedModules {
  const rawParts = value
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  const parts = rawParts.length ? rawParts.map((part) => MODULE_ALIASES[part] ?? part) : ['all'];
  const invalid = parts.filter((part) => part !== 'all' && !VALID_MODULES.includes(part as ExtractionModule));
  if (invalid.length) {
    throw new CliUsageError(`Unknown module(s): ${invalid.join(', ')}. Valid: all, ${VALID_MODULES.join(', ')}`);
  }

  return new Set(parts as (ExtractionModule | 'all')[]);
}

export function isP4kFree(modules: SelectedModules): boolean {
  if (modules.has('all')) return false;
  return [...modules].every((moduleName) => P4K_FREE_MODULES.has(moduleName as ExtractionModule));
}

export function needsRsiDb(modules: SelectedModules): boolean {
  if (modules.has('all')) return true;
  return [...modules].some((moduleName) => RSI_MODULES.has(moduleName as ExtractionModule));
}

export function needsGameDb(modules: SelectedModules): boolean {
  if (modules.has('all')) return true;
  return [...modules].some((moduleName) => !RSI_MODULES.has(moduleName as ExtractionModule));
}

export function formatModules(modules: SelectedModules): string {
  return modules.has('all') ? 'all' : [...modules].join(', ');
}
