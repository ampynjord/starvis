import { NextResponse } from 'next/server';
import { getAuthToken, proxyJson } from '../../../../../_utils/proxy';

export async function PUT(req: Request, { params }: { params: Promise<{ mid: string }> }) {
  try {
    const { mid } = await params;
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    return proxyJson('PUT', `/admin/corporations/memberships/${mid}/reject`, token, body);
  } catch (e: any) {
    console.error('[admin/corporations/memberships/:mid/reject PUT]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
