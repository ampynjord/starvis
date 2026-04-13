import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const API_BASE = process.env.API_URL ?? 'http://localhost:3000';

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get('starvis_token')?.value ?? null;
}

export async function GET() {
  try {
    const token = await getToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const upstream = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!upstream.ok) {
      const res = NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      res.cookies.delete('starvis_token');
      return res;
    }

    const data = await upstream.json();
    return NextResponse.json({ user: data.user });
  } catch (e: any) {
    console.error('[auth/me GET]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}

export async function PUT(req: Request) {
  try {
    const token = await getToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const upstream = await fetch(`${API_BASE}/auth/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { /* empty body */ }

    if (!upstream.ok) {
      return NextResponse.json({ error: data.error ?? 'Update failed' }, { status: upstream.status });
    }
    return NextResponse.json({ user: data.user });
  } catch (e: any) {
    console.error('[auth/me PUT]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
