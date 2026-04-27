/**
 * Route Handler Next.js pour le chatbot SSE.
 * Pipe le stream SSE de l'API backend directement vers le browser (bypass rewrite buffering).
 * Transmet le cookie starvis_token comme Bearer token vers l'API.
 */
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_URL = process.env.API_URL || 'http://api:3000';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('starvis_token')?.value;

  const body = await req.json();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const upstream = await fetch(`${API_URL}/api/v1/chat`, {
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
