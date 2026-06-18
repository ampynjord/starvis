import { NextResponse } from 'next/server';
import { logApiError } from '@/lib/server-logger';
import { getAuthToken, proxyJson } from '../../_utils/proxy';

export async function GET(req: Request) {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const url = new URL(req.url);
    const params = new URLSearchParams();
    params.set('limit', url.searchParams.get('limit') ?? '100');
    params.set('scope', url.searchParams.get('scope') ?? 'all');

    for (const key of ['role', 'userId']) {
      const value = url.searchParams.get(key);
      if (value) params.set(key, value);
    }

    return proxyJson('GET', `/admin/request-logs?${params.toString()}`, token);
  } catch (e: any) {
    logApiError('admin/request-logs GET', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
