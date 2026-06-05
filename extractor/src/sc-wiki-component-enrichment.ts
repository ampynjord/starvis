import { SC_WIKI_API_URL, SCRAPER_USER_AGENT } from './config.js';
import logger from './logger.js';

export type ComponentWikiEnrichment = {
  grade: string | null;
  componentClass: string | null;
};

type WikiItemsPayload = {
  data?: unknown;
  meta?: {
    last_page?: unknown;
  };
};

const CLASS_VALUES = new Set(['Civilian', 'Competition', 'Industrial', 'Military', 'Stealth']);

const TYPE_ALIASES: Record<string, string[]> = {
  Bomb: ['Bomb'],
  Cooler: ['Cooler'],
  EMP: ['EMP'],
  Missile: ['Missile'],
  PowerPlant: ['PowerPlant'],
  QuantumDrive: ['QuantumDrive'],
  Radar: ['Radar'],
  Shield: ['Shield'],
  Turret: ['Turret'],
  WeaponGun: ['WeaponGun'],
};

function normalizeGrade(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const grade = value.trim().toUpperCase();
  return /^[A-Z]$/.test(grade) ? grade : null;
}

function normalizeComponentClass(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  for (const valid of CLASS_VALUES) {
    if (valid.toLowerCase() === normalized) return valid;
  }
  return null;
}

async function fetchWikiItemsByType(type: string): Promise<any[]> {
  const items: any[] = [];
  let page = 1;
  let lastPage = 1;

  do {
    const url = new URL(`${SC_WIKI_API_URL}/items`);
    url.searchParams.set('filter[type]', type);
    url.searchParams.set('page[size]', '100');
    url.searchParams.set('page[number]', String(page));

    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': SCRAPER_USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.toString()}`);

    const payload = (await res.json()) as WikiItemsPayload;
    if (Array.isArray(payload.data)) items.push(...payload.data);
    lastPage = Number(payload.meta?.last_page ?? page);
    page += 1;
  } while (page <= lastPage);

  return items;
}

export async function fetchComponentWikiEnrichment(componentTypes: Iterable<string>): Promise<Map<string, ComponentWikiEnrichment>> {
  const wikiTypes = new Set<string>();
  for (const type of componentTypes) {
    for (const wikiType of TYPE_ALIASES[type] ?? [type]) wikiTypes.add(wikiType);
  }

  const byClassName = new Map<string, ComponentWikiEnrichment>();
  for (const wikiType of wikiTypes) {
    try {
      const items = await fetchWikiItemsByType(wikiType);
      for (const item of items) {
        const className = typeof item.class_name === 'string' ? item.class_name : null;
        if (!className) continue;
        const grade = normalizeGrade(item.grade);
        const componentClass = normalizeComponentClass(item.class);
        if (grade || componentClass) byClassName.set(className.toLowerCase(), { grade, componentClass });
      }
    } catch (err) {
      logger.warn(`[components] SC Wiki enrichment failed for type ${wikiType}: ${(err as Error).message}`);
    }
  }

  return byClassName;
}
