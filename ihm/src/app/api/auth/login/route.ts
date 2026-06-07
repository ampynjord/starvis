import { NextResponse } from 'next/server';
import { readUpstreamJson, setSessionCookie, upstreamUrl } from '../../_utils/proxy';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const upstream = await fetch(upstreamUrl('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await readUpstreamJson(upstream);

    if (!upstream.ok) {
      return NextResponse.json({ error: data.error ?? 'Login failed' }, { status: upstream.status });
    }

    // 2FA step — return pending token to client, no cookie yet
    if (data.requires2FA) {
      if (!data.pendingToken) {
        return NextResponse.json({ error: 'Login service returned an invalid 2FA response' }, { status: 502 });
      }
      return NextResponse.json({ requires2FA: true, pendingToken: data.pendingToken });
    }

    if (!data.user || !data.token) {
      return NextResponse.json({ error: 'Login service returned an invalid response' }, { status: 502 });
    }

    const res = NextResponse.json({ user: data.user });
    setSessionCookie(res, data.token);
    return res;
  } catch (e: any) {
    console.error('[auth/login]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
