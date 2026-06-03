import { NextResponse } from 'next/server';
import { getAuthToken, proxyJson } from '../../../../../_utils/proxy';

export async function PUT(_req: Request, { params }: { params: Promise<{ mid: string }> }) {
  try {
    const { mid } = await params;
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    return proxyJson('PUT', `/admin/corporations/memberships/${mid}/approve`, token);
  } catch (e: any) {
    console.error('[admin/corporations/memberships/:mid/approve PUT]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
