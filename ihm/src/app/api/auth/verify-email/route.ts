import { NextResponse } from 'next/server';
import { logApiError } from '@/lib/server-logger';
import { readUpstreamJson, setSessionCookie, upstreamUrl } from '../../_utils/proxy';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const upstream = await fetch(upstreamUrl('/auth/verify-email'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await readUpstreamJson(upstream);
    if (!upstream.ok) {
      return NextResponse.json({ error: data.error ?? 'Verification failed' }, { status: upstream.status });
    }

    const res = NextResponse.json({ user: data.user });
    setSessionCookie(res, data.token);
    return res;
  } catch (e: any) {
    logApiError('auth/verify-email', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
