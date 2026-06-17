import { NextResponse } from 'next/server';
import { logApiError } from '@/lib/server-logger';
import { getAuthToken, proxyJson } from '../../../../_utils/proxy';

export async function POST() {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    return proxyJson('POST', '/corp/fleet/rsi-sync/session', token);
  } catch (e: any) {
    logApiError('corp/fleet/rsi-sync/session POST', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
