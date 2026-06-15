import { NextResponse } from 'next/server';
import { logApiError } from '@/lib/server-logger';
import { getAuthToken, proxyJson } from '../../_utils/proxy';

export async function GET(req: Request) {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const url = new URL(req.url);
    const limit = url.searchParams.get('limit') ?? '100';
    const scope = url.searchParams.get('scope') ?? 'all';
    return proxyJson('GET', `/admin/request-logs?limit=${encodeURIComponent(limit)}&scope=${encodeURIComponent(scope)}`, token);
  } catch (e: any) {
    logApiError('admin/request-logs GET', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
