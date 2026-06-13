import { NextResponse } from 'next/server';
import { serverApiHeaders, upstreamUrl } from '../../../_utils/proxy';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const upstream = await fetch(upstreamUrl(`/api/v1/starmap/locations/${encodeURIComponent(id)}`), { headers: await serverApiHeaders() });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
