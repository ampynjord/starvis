import { NextResponse } from 'next/server';
import { getAuthToken, proxyJson } from '../../../_utils/proxy';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    return proxyJson('PUT', `/admin/users/${id}`, token, body);
  } catch (e: any) {
    console.error('[admin/users/:id PUT]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    return proxyJson('DELETE', `/admin/users/${id}`, token);
  } catch (e: any) {
    console.error('[admin/users/:id DELETE]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
