import { NextResponse } from 'next/server';
import { logApiError } from '@/lib/server-logger';
import { getAuthToken, proxyJson } from '../../../../../_utils/proxy';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    return proxyJson('POST', `/admin/corporations/${id}/members`, token, body);
  } catch (e: any) {
    logApiError('admin/corporations/:id/members POST', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
