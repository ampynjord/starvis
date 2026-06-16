import { type ExtractionModule, GAME_ENVS, MODULE_ALIASES, NETWORK_MODULES, P4K_MODULES, VALID_MODULES } from '../module-registry.js';

export type { ExtractionModule };
export { GAME_ENVS, VALID_MODULES };

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

  const parts = rawParts.length ? rawParts.map((part) => MODULE_ALIASES.get(part) ?? part) : ['all'];
  const invalid = parts.filter((part) => part !== 'all' && !VALID_MODULES.includes(part as ExtractionModule));
  if (invalid.length) {
    throw new CliUsageError(`Unknown module(s): ${invalid.join(', ')}. Valid: all, ${VALID_MODULES.join(', ')}`);
  }

  return new Set(parts as (ExtractionModule | 'all')[]);
}

export function isP4kFree(modules: SelectedModules): boolean {
  if (modules.has('all')) return false;
  return [...modules].every((moduleName) => !P4K_MODULES.has(moduleName as ExtractionModule));
}

export function needsRsiDb(modules: SelectedModules): boolean {
  if (modules.has('all')) return true;
  return [...modules].some((moduleName) => NETWORK_MODULES.has(moduleName as ExtractionModule));
}

export function needsGameDb(modules: SelectedModules): boolean {
  if (modules.has('all')) return true;
  return [...modules].some((moduleName) => P4K_MODULES.has(moduleName as ExtractionModule));
}

export function formatModules(modules: SelectedModules): string {
  return modules.has('all') ? 'all' : [...modules].join(', ');
}
