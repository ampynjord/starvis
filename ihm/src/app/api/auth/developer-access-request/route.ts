import { NextResponse } from 'next/server';
import { logApiError } from '@/lib/server-logger';
import { getAuthToken, proxyJson } from '../../_utils/proxy';

export async function GET() {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    return proxyJson('GET', '/auth/developer-access-request', token);
  } catch (e: any) {
    logApiError('auth/developer-access-request GET', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}

export async function POST(req: Request) {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    return proxyJson('POST', '/auth/developer-access-request', token, body);
  } catch (e: any) {
    logApiError('auth/developer-access-request POST', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
