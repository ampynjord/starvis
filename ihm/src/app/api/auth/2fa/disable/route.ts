import { NextResponse } from 'next/server';
import { getAuthToken, readUpstreamJson, upstreamUrl } from '../../../_utils/proxy';

export async function POST(req: Request) {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const upstream = await fetch(upstreamUrl('/auth/2fa/disable'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    const data = await readUpstreamJson(upstream);
    if (!upstream.ok) {
      return NextResponse.json({ error: data.error ?? 'Deactivation failed' }, { status: upstream.status });
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[auth/2fa/disable]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
