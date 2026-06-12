import { NextResponse } from 'next/server';
import { getAuthToken, proxyJson } from '@/app/api/_utils/proxy';
import { logApiError } from '@/lib/server-logger';

export async function PUT(req: Request, { params }: { params: Promise<{ mid: string }> }) {
  const { mid } = await params;
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    return proxyJson('PUT', `/corp/members/${mid}/role`, token, body);
  } catch (e) {
    logApiError('corp/members/:mid/role PUT', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
