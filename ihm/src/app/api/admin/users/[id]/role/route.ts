import { NextResponse } from 'next/server';
import { getAuthToken, readUpstreamJson, upstreamUrl } from '../../../../_utils/proxy';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const upstream = await fetch(upstreamUrl(`/admin/users/${id}/role`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    const data = await readUpstreamJson(upstream);

    if (!upstream.ok) {
      return NextResponse.json({ error: data.error ?? 'Update failed' }, { status: upstream.status });
    }
    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[admin/users/role PUT]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
