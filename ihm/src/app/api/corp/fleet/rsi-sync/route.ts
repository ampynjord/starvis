import { NextResponse } from 'next/server';
import { logApiError } from '@/lib/server-logger';
import { readUpstreamJson, upstreamUrl } from '../../../_utils/proxy';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = req.headers.get('x-starvis-rsi-sync-token') ?? body?.syncToken ?? '';
    const upstream = await fetch(upstreamUrl('/corp/fleet/rsi-sync'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Starvis-RSI-Sync-Token': token,
      },
      body: JSON.stringify(body),
    });
    const data = await readUpstreamJson(upstream);
    return NextResponse.json(data, { status: upstream.status });
  } catch (e: any) {
    logApiError('corp/fleet/rsi-sync POST', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
