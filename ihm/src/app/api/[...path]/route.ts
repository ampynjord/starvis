/**
 * Generic browser → Express proxy for every path listed in `proxy-rules.ts`.
 *
 * Replaces ~20 near-identical route handlers that all did the same three things:
 * read the session cookie, forward the request, map a network failure to 503.
 * Upstream status and body are passed through untouched so callers keep reading
 * `data.error` exactly as before.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { logApiError } from '@/lib/server-logger';
import { forwardedClientHeaders, getAuthToken, readUpstreamJson, upstreamUrl } from '../_utils/proxy';
import { resolveProxyRule } from '../_utils/proxy-rules';

const BODYLESS_METHODS = new Set(['GET', 'HEAD', 'DELETE']);

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<NextResponse> {
  const { path: segments } = await ctx.params;
  const path = `/${segments.join('/')}`;

  const rule = resolveProxyRule(path);
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const token = await getAuthToken();
  if (rule.auth === 'session' && !token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const search = req.nextUrl.search;
  const target = `${rule.upstream ? rule.upstream(path) : path}${search}`;

  const headers: Record<string, string> = { ...(await forwardedClientHeaders()) };
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: string | undefined;
  if (!BODYLESS_METHODS.has(req.method)) {
    body = JSON.stringify(await req.json().catch(() => ({})));
    headers['Content-Type'] = 'application/json';
  }

  try {
    const upstream = await fetch(upstreamUrl(target), { method: req.method, headers, body });
    const data = await readUpstreamJson(upstream);
    return NextResponse.json(data, { status: upstream.status });
  } catch (e) {
    logApiError(`proxy ${req.method} ${path}`, e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
