import { NextResponse } from 'next/server';
import { logApiError } from '@/lib/server-logger';
import { getAuthToken, proxyJson } from '../../../_utils/proxy';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { id } = await params;
    return proxyJson('DELETE', `/auth/api-tokens/${encodeURIComponent(id)}`, token);
  } catch (e) {
    logApiError('auth/api-tokens/:id DELETE', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
