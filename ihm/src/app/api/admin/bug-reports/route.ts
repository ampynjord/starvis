import { NextResponse } from 'next/server';
import { getAuthToken, readUpstreamJson, upstreamUrl } from '../../_utils/proxy';

export async function GET(req: Request) {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const qs = searchParams.toString();
    const upstream = await fetch(upstreamUrl(`/admin/bug-reports${qs ? `?${qs}` : ''}`), {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await readUpstreamJson(upstream);
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
