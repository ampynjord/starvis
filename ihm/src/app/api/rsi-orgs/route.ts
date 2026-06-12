import { NextResponse } from 'next/server';
import { logApiError } from '@/lib/server-logger';
import { upstreamUrl } from '../_utils/proxy';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') ?? '';
    const page = searchParams.get('page') ?? '1';
    const pageSize = searchParams.get('pageSize') ?? '12';
    const upstream = await fetch(upstreamUrl(`/rsi-orgs?q=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}`), {
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (e: any) {
    logApiError('rsi-orgs GET', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
