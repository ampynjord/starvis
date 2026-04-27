import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const API_BASE = process.env.API_URL ?? 'http://localhost:3000';

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get('starvis_token')?.value ?? null;
}

export async function POST() {
  try {
    const token = await getToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const upstream = await fetch(`${API_BASE}/auth/api-token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    const text = await upstream.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      /* empty */
    }

    if (!upstream.ok) {
      return NextResponse.json({ error: data.error ?? 'Failed' }, { status: upstream.status });
    }
    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[auth/api-token POST]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
