import type { TaxonomyCategory, UniverseEntityNexus, UniverseOmniResult } from '@/types/universe';

type NexusLang = 'fr' | 'en';

/** Surface Nexus canonique (sans préfixe de version). `/api/v2/universe` reste un alias côté API. */
const UNIVERSE_API_BASE = '/api/universe';

function getBaseUrl(): string {
  if (typeof window !== 'undefined') return '';
  return (process.env.API_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
}

export async function fetchUniverseTaxonomy(env = 'live'): Promise<TaxonomyCategory[]> {
  const base = getBaseUrl();
  const res = await fetch(`${base}${UNIVERSE_API_BASE}/taxonomy?env=${encodeURIComponent(env)}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

export async function fetchOmniSearch(query: string, env = 'live', limit = 20, lang: NexusLang = 'fr'): Promise<UniverseOmniResult[]> {
  if (!query || query.trim().length === 0) return [];
  const base = getBaseUrl();
  const res = await fetch(
    `${base}${UNIVERSE_API_BASE}/omni-search?q=${encodeURIComponent(query)}&env=${encodeURIComponent(env)}&lang=${lang}&limit=${limit}`,
  );
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

export async function fetchUniverseExplore(params: {
  category?: string;
  sub_category?: string;
  subCategory?: string;
  search?: string;
  manufacturer?: string;
  type?: string;
  status?: string;
  page?: number;
  limit?: number;
  env?: string;
  lang?: NexusLang;
}) {
  const query = new URLSearchParams();
  if (params.category) query.set('category', params.category);
  const subCategory = params.sub_category || params.subCategory;
  if (subCategory && subCategory !== 'all') query.set('sub_category', subCategory);
  if (params.search) query.set('search', params.search);
  if (params.manufacturer) query.set('manufacturer', params.manufacturer);
  if (params.type) query.set('type', params.type);
  if (params.status && params.status !== 'all') query.set('status', params.status);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.env) query.set('env', params.env);
  if (params.lang) query.set('lang', params.lang);

  const base = getBaseUrl();
  const res = await fetch(`${base}${UNIVERSE_API_BASE}/explore?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch universe exploration data');
  return res.json();
}

export async function fetchEntityNexus(
  category: string,
  id: string,
  env = 'live',
  lang: NexusLang = 'fr',
): Promise<UniverseEntityNexus | null> {
  const base = getBaseUrl();
  const res = await fetch(
    `${base}${UNIVERSE_API_BASE}/entities/${encodeURIComponent(category)}/${encodeURIComponent(id)}?env=${encodeURIComponent(env)}&lang=${lang}`,
  );
  if (!res.ok) return null;
  const json = await res.json();
  return json.data || null;
}
