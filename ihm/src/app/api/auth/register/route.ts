import { NextResponse } from 'next/server';
import { logApiError } from '@/lib/server-logger';
import { readUpstreamJson, upstreamUrl } from '../../_utils/proxy';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const upstream = await fetch(upstreamUrl('/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await readUpstreamJson(upstream);

    if (!upstream.ok) {
      return NextResponse.json({ error: data.error ?? 'Registration failed' }, { status: upstream.status });
    }

    // Email verification required — no token, no cookie
    return NextResponse.json({ requiresVerification: true });
  } catch (e: any) {
    const msg = e?.cause?.code ?? e?.message ?? String(e);
    logApiError('auth/register', `API unreachable (${upstreamUrl('')}): ${msg}`);
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json({ error: isDev ? `API unreachable (${upstreamUrl('')}): ${msg}` : 'Service unavailable' }, { status: 503 });
  }
}
