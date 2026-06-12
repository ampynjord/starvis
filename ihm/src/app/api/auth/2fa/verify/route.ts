import { NextResponse } from 'next/server';
import { logApiError } from '@/lib/server-logger';
import { readUpstreamJson, setSessionCookie, upstreamUrl } from '../../../_utils/proxy';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const upstream = await fetch(upstreamUrl('/auth/2fa/verify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await readUpstreamJson(upstream);
    if (!upstream.ok) {
      return NextResponse.json({ error: data.error ?? 'Verification failed' }, { status: upstream.status });
    }

    if (!data.user || !data.token) {
      return NextResponse.json({ error: 'Login service returned an invalid response' }, { status: 502 });
    }

    const res = NextResponse.json({ user: data.user });
    setSessionCookie(res, data.token);
    return res;
  } catch (e: any) {
    logApiError('auth/2fa/verify', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
