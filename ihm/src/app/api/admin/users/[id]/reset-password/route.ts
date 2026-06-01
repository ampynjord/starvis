import { NextResponse } from 'next/server';
import { getAuthToken, proxyJson } from '../../../../_utils/proxy';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    return proxyJson('POST', `/admin/users/${id}/reset-password`, token, body);
  } catch (e: any) {
    console.error('[admin/users/:id/reset-password POST]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
