import { NextResponse } from 'next/server';
import { getAuthToken, proxyJson } from '../../../../_utils/proxy';

export async function PUT(req: Request, { params }: { params: Promise<{ fid: string }> }) {
  try {
    const { fid } = await params;
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    return proxyJson('PUT', `/admin/corporations/fleet/${fid}`, token, body);
  } catch (e: any) {
    console.error('[admin/corporations/fleet/:fid PUT]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ fid: string }> }) {
  try {
    const { fid } = await params;
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    return proxyJson('DELETE', `/admin/corporations/fleet/${fid}`, token);
  } catch (e: any) {
    console.error('[admin/corporations/fleet/:fid DELETE]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
