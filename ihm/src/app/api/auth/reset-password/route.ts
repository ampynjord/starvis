import { NextResponse } from 'next/server';
import { readUpstreamJson, upstreamUrl } from '../../_utils/proxy';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const upstream = await fetch(upstreamUrl('/auth/reset-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await readUpstreamJson(upstream);
    if (!upstream.ok) {
      return NextResponse.json({ error: data.error ?? 'Reset failed' }, { status: upstream.status });
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[auth/reset-password]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
