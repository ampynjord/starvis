import { NextResponse } from 'next/server';
import { getAuthToken, proxyJson } from '@/app/api/_utils/proxy';
import { logApiError } from '@/lib/server-logger';

export async function GET() {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    return proxyJson('GET', '/corp', token);
  } catch (e) {
    logApiError('corp GET', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
