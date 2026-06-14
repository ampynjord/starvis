import { NextResponse } from 'next/server';
import { logApiError } from '@/lib/server-logger';
import { getAuthToken, proxyJson } from '../../_utils/proxy';

export async function GET() {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    return proxyJson('GET', '/admin/api-supervision', token);
  } catch (e: any) {
    logApiError('admin/api-supervision GET', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
