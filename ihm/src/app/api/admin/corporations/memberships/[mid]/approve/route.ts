import { NextResponse } from 'next/server';
import { logApiError } from '@/lib/server-logger';
import { getAuthToken, proxyJson } from '../../../../../_utils/proxy';

export async function PUT(req: Request, { params }: { params: Promise<{ mid: string }> }) {
  try {
    const { mid } = await params;
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    return proxyJson('PUT', `/admin/corporations/memberships/${mid}/approve`, token, body);
  } catch (e: any) {
    logApiError('admin/corporations/memberships/:mid/approve PUT', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
