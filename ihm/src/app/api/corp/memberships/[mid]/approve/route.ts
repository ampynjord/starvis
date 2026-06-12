import { NextResponse } from 'next/server';
import { getAuthToken, proxyJson } from '@/app/api/_utils/proxy';
import { logApiError } from '@/lib/server-logger';

export async function PUT(req: Request, { params }: { params: Promise<{ mid: string }> }) {
  const { mid } = await params;
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const body = await req.json().catch(() => undefined);
    return proxyJson('PUT', `/corp/memberships/${mid}/approve`, token, body);
  } catch (e) {
    logApiError('corp/memberships/:mid/approve PUT', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
