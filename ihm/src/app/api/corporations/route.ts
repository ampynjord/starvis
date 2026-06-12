import { NextResponse } from 'next/server';
import { logApiError } from '@/lib/server-logger';
import { getAuthToken, proxyJson } from '../_utils/proxy';

export async function GET() {
  try {
    const token = await getAuthToken();
    return proxyJson('GET', '/corporations', token ?? '');
  } catch (e: any) {
    logApiError('corporations GET', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
