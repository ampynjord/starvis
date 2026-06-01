import { NextResponse } from 'next/server';
import { clearSessionCookie, getAuthToken, readUpstreamJson, upstreamUrl } from '../../_utils/proxy';

export async function GET() {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const upstream = await fetch(upstreamUrl('/auth/me'), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!upstream.ok) {
      const res = NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      clearSessionCookie(res);
      return res;
    }

    const data = await upstream.json();
    return NextResponse.json({ user: data.user });
  } catch (e: any) {
    console.error('[auth/me GET]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}

export async function DELETE() {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const upstream = await fetch(upstreamUrl('/auth/me'), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!upstream.ok) {
      const data = await readUpstreamJson(upstream);
      return NextResponse.json({ error: (data as any).error ?? 'Deletion failed' }, { status: upstream.status });
    }

    const res = NextResponse.json({ success: true });
    clearSessionCookie(res);
    return res;
  } catch (e: any) {
    console.error('[auth/me DELETE]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}

export async function PUT(req: Request) {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const upstream = await fetch(upstreamUrl('/auth/me'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    const data = await readUpstreamJson(upstream);

    if (!upstream.ok) {
      return NextResponse.json({ error: data.error ?? 'Update failed' }, { status: upstream.status });
    }
    return NextResponse.json({ user: data.user });
  } catch (e: any) {
    console.error('[auth/me PUT]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
