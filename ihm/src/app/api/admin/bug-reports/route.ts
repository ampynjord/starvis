import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const API_BASE = process.env.API_URL ?? 'http://localhost:3000';

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get('starvis_token')?.value ?? null;
}

export async function GET(req: Request) {
  try {
    const token = await getToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const qs = searchParams.toString();
    const upstream = await fetch(`${API_BASE}/admin/bug-reports${qs ? `?${qs}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
