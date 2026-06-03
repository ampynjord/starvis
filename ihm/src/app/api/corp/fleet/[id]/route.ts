import { NextResponse } from 'next/server';
import { getAuthToken, proxyJson } from '../../../_utils/proxy';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    return proxyJson('DELETE', `/corp/fleet/${id}`, token);
  } catch (e: any) {
    console.error('[corp/fleet/:id DELETE]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
