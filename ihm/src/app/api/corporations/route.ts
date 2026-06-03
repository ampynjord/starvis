import { NextResponse } from 'next/server';
import { getAuthToken, proxyJson } from '../_utils/proxy';

export async function GET() {
  try {
    const token = await getAuthToken();
    return proxyJson('GET', '/corporations', token ?? '');
  } catch (e: any) {
    console.error('[corporations GET]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
