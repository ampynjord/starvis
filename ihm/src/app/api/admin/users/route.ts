import { NextResponse } from 'next/server';
import { getAuthToken, proxyJson } from '../../_utils/proxy';

export async function GET() {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    return proxyJson('GET', '/admin/users', token);
  } catch (e: any) {
    console.error('[admin/users GET]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}

export async function POST(req: Request) {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    return proxyJson('POST', '/admin/users', token, body);
  } catch (e: any) {
    console.error('[admin/users POST]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
