import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const API_BASE = process.env.API_URL ?? 'http://localhost:3000';

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get('starvis_token')?.value ?? null;
}

export async function POST(req: Request) {
  try {
    const token = await getToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const upstream = await fetch(`${API_BASE}/api/v1/bug-reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
