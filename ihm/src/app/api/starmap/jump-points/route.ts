import { NextResponse } from 'next/server';
import { upstreamUrl } from '../../_utils/proxy';

export async function GET() {
  try {
    const upstream = await fetch(upstreamUrl('/api/v1/starmap/jump-points'));
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
