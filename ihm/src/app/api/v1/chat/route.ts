/**
 * Route Handler Next.js pour le chatbot SSE.
 * Pipe le stream SSE de l'API backend directement vers le browser (bypass rewrite buffering).
 * Transmet le cookie de session comme Bearer token vers l'API.
 */
import type { NextRequest } from 'next/server';
import { forwardedClientHeadersFromHeaders, getAuthToken, upstreamUrl } from '../../_utils/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const token = await getAuthToken();

  const body = await req.json();

  const headers: Record<string, string> = { ...forwardedClientHeadersFromHeaders(req.headers), 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const upstream = await fetch(upstreamUrl('/api/v1/chat'), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(JSON.stringify({ error: 'upstream error' }), { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
