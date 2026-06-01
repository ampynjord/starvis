import { NextResponse } from 'next/server';
import { getAuthToken, proxyJson } from '../../../_utils/proxy';

export async function POST() {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    return proxyJson('POST', '/auth/2fa/setup', token);
  } catch (e: any) {
    console.error('[auth/2fa/setup]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
