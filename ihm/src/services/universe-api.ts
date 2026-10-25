import type { UniverseEntityNexus, UniverseOmniResult } from '@/types/universe';

const API_BASE = '';

export async function fetchOmniSearch(query: string, env = 'live', limit = 20): Promise<UniverseOmniResult[]> {
  if (!query || query.trim().length === 0) return [];
  const res = await fetch(
    `${API_BASE}/api/v2/universe/omni-search?q=${encodeURIComponent(query)}&env=${encodeURIComponent(env)}&limit=${limit}`,
  );
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

export async function fetchUniverseExplore(params: {
  category?: string;
  search?: string;
  manufacturer?: string;
  type?: string;
  page?: number;
  limit?: number;
  env?: string;
}) {
  const query = new URLSearchParams();
  if (params.category) query.set('category', params.category);
  if (params.search) query.set('search', params.search);
  if (params.manufacturer) query.set('manufacturer', params.manufacturer);
  if (params.type) query.set('type', params.type);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.env) query.set('env', params.env);

  const res = await fetch(`${API_BASE}/api/v2/universe/explore?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch universe exploration data');
  return res.json();
}

export async function fetchEntityNexus(category: string, id: string, env = 'live'): Promise<UniverseEntityNexus | null> {
  const res = await fetch(
    `${API_BASE}/api/v2/universe/entities/${encodeURIComponent(category)}/${encodeURIComponent(id)}?env=${encodeURIComponent(env)}`,
  );
  if (!res.ok) return null;
  const json = await res.json();
  return json.data || null;
}
