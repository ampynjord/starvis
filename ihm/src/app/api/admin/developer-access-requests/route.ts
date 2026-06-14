import { NextResponse } from 'next/server';
import { logApiError } from '@/lib/server-logger';
import { getAuthToken, proxyJson } from '../../_utils/proxy';

export async function GET(req: Request) {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
    return proxyJson('GET', `/admin/developer-access-requests${suffix}`, token);
  } catch (e: any) {
    logApiError('admin/developer-access-requests GET', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
