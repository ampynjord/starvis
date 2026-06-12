import { NextResponse } from 'next/server';
import { logApiError } from '@/lib/server-logger';
import { getAuthToken, proxyJson } from '../../../../_utils/proxy';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    return proxyJson('GET', `/admin/users/${id}/fleet`, token);
  } catch (e: any) {
    logApiError('admin/users/:id/fleet GET', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
