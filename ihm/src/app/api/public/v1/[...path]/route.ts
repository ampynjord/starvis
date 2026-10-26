import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { SERVER_API_KEY } from '@/lib/server-config';
import { forwardedClientHeadersFromHeaders, getAuthToken, upstreamUrl } from '../../../_utils/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_METHODS = new Set(['GET', 'POST']);
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'cache-control', 'etag', 'last-modified'];

function isSameOriginRequest(req: NextRequest): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site === 'same-origin' || site === 'none') return true;

  const currentOrigin = req.nextUrl.origin;
  const origin = req.headers.get('origin');
  if (origin && origin === currentOrigin) return true;

  const referer = req.headers.get('referer');
  if (!referer) return false;
  try {
    return new URL(referer).origin === currentOrigin;
  } catch {
    return false;
  }
}

/**
 * Le proxy public, parametre par la version amont.
 *
 * Le chemin `/api/v1/` etait code en dur : `/api/v2` etait donc injoignable
 * depuis le site, et un tiers passant par le proxy ne pouvait pas l'atteindre
 * non plus. La version se lit maintenant du segment de route, ce qui evite de
 * recopier le proxy a chaque version.
 */
export async function proxyPublicApi(req: NextRequest, context: { params: Promise<{ path?: string[] }> }, apiVersion: 'v1' | 'v2' = 'v1') {
  if (!ALLOWED_METHODS.has(req.method)) {
    return NextResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 });
  }
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ success: false, error: 'Same-origin web request required' }, { status: 403 });
  }
  if (!SERVER_API_KEY) {
    return NextResponse.json({ success: false, error: 'Public API proxy is not configured' }, { status: 500 });
  }

  const { path = [] } = await context.params;
  const upstreamPath = `/api/${apiVersion}/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
  const headers: Record<string, string> = {
    ...forwardedClientHeadersFromHeaders(req.headers),
    Accept: req.headers.get('accept') ?? 'application/json',
    'X-API-Key': SERVER_API_KEY,
    'X-Starvis-Internal-Client': 'ihm-public-proxy',
  };

  const token = await getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const contentType = req.headers.get('content-type');
  if (contentType) headers['Content-Type'] = contentType;

  const upstream = await fetch(upstreamUrl(upstreamPath), {
    method: req.method,
    headers,
    body: req.method === 'GET' ? undefined : await req.arrayBuffer(),
    cache: 'no-store',
  });

  const responseHeaders = new Headers();
  for (const header of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(header);
    if (value) responseHeaders.set(header, value);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxyPublicApi;
export const POST = proxyPublicApi;
