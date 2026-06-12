import { NextResponse } from 'next/server';
import { logApiError } from '@/lib/server-logger';
import { getAuthToken, proxyJson } from '../../_utils/proxy';

export async function GET() {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    return proxyJson('GET', '/corp/fleet', token);
  } catch (e: any) {
    logApiError('corp/fleet GET', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}

export async function POST(req: Request) {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    return proxyJson('POST', '/corp/fleet', token, body);
  } catch (e: any) {
    logApiError('corp/fleet POST', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
