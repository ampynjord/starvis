import { NextResponse } from 'next/server';
import { getAuthToken, proxyJson } from '../../../_utils/proxy';

export async function GET() {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    return proxyJson('GET', '/admin/corporations/pending', token);
  } catch (e: any) {
    console.error('[admin/corporations/pending GET]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
