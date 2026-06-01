import { NextResponse } from 'next/server';
import { getAuthToken, readUpstreamJson, upstreamUrl } from '../_utils/proxy';

export async function GET(req: Request) {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const url = new URL(req.url);
    const qs = url.searchParams.toString();
    const upstream = await fetch(upstreamUrl(`/api/v1/bug-reports${qs ? `?${qs}` : ''}`), {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await readUpstreamJson(upstream);
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}

export async function POST(req: Request) {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const upstream = await fetch(upstreamUrl('/api/v1/bug-reports'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    const data = await readUpstreamJson(upstream);
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
