import { NextResponse } from 'next/server';
import { getAuthToken, proxyJson } from '@/app/api/_utils/proxy';

export async function GET() {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    return proxyJson('GET', '/corp', token);
  } catch (e) {
    console.error('[corp GET]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
