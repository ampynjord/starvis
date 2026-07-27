import { SERVER_API_KEY, SERVER_API_URL } from './server-config';

type JsonObject = Record<string, unknown>;

export interface ServerPaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  count?: number;
}

function apiHeaders(): HeadersInit | undefined {
  return SERVER_API_KEY
    ? {
        'X-API-Key': SERVER_API_KEY,
        'X-Starvis-Internal-Client': 'ihm-server-component',
      }
    : undefined;
}

export function buildApiUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  // Concaténer plutôt que passer par une base : `new URL('/ships/x', '…/api/v1')`
  // écrase le chemin de la base et produit `…/ships/x`, qui n'existe pas côté
  // Express. Toutes les requêtes serveur (métadonnées, JSON-LD, extraits SEO)
  // partaient ainsi en 404 silencieux — serverGet renvoyant null sans bruit.
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${SERVER_API_URL}/api/v1${normalizedPath}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function serverGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
  revalidate = 3600,
): Promise<T | null> {
  try {
    const res = await fetch(buildApiUrl(path, params), {
      headers: apiHeaders(),
      next: { revalidate },
    });
    if (!res.ok) return null;
    const json = ((await res.json().catch(() => null)) as JsonObject | null) ?? {};
    // Liste paginée au format JSend : la pagination vit sous `meta`. L'aplatir
    // donne la même forme que les listes non JSend — sans quoi le déballage
    // générique ci-dessous ne rendrait que le tableau, sans total ni pages.
    const meta = json.meta as JsonObject | undefined;
    if (Array.isArray(json.data) && meta && typeof meta.total === 'number') {
      return { ...meta, data: json.data } as T;
    }
    if ('success' in json && 'data' in json && typeof json.total !== 'number') return json.data as T;
    return json as T;
  } catch {
    return null;
  }
}

export async function serverGetPaginated<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
  revalidate = 3600,
): Promise<ServerPaginatedResponse<T> | null> {
  const result = await serverGet<ServerPaginatedResponse<T>>(path, params, revalidate);
  return result && Array.isArray(result.data) ? result : null;
}

export async function serverGetAllPaginated<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
  opts: { limit?: number; maxItems?: number; revalidate?: number } = {},
): Promise<T[]> {
  const limit = opts.limit ?? 200;
  const maxItems = opts.maxItems ?? 2000;
  const revalidate = opts.revalidate ?? 3600;
  const first = await serverGetPaginated<T>(path, { ...params, page: 1, limit }, revalidate);
  if (!first) return [];

  const items = [...first.data];
  const pages = Math.min(first.pages || 1, Math.ceil(maxItems / limit));
  for (let page = 2; page <= pages && items.length < maxItems; page++) {
    const next = await serverGetPaginated<T>(path, { ...params, page, limit }, revalidate);
    if (!next?.data.length) break;
    items.push(...next.data);
  }

  return items.slice(0, maxItems);
}
