import { NextResponse } from 'next/server';
import { logApiError } from '@/lib/server-logger';
import { getAuthToken, proxyJson } from '../../_utils/proxy';

export async function POST(request: Request) {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    return proxyJson('POST', '/auth/api-token', token, body);
  } catch (e: any) {
    logApiError('auth/api-token POST', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
