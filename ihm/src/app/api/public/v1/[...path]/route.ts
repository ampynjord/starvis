import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { SERVER_API_KEY } from '@/lib/server-config';
import { getAuthToken, upstreamUrl } from '../../../_utils/proxy';

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

async function proxyPublicApi(req: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
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
  const upstreamPath = `/api/v1/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
  const headers: Record<string, string> = {
    Accept: req.headers.get('accept') ?? 'application/json',
    'X-API-Key': SERVER_API_KEY,
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
