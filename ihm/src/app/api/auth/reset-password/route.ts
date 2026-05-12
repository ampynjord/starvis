import { NextResponse } from 'next/server';

const API_BASE = process.env.API_URL ?? 'http://localhost:3000';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const upstream = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return NextResponse.json({ error: data.error ?? 'Reset failed' }, { status: upstream.status });
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[auth/reset-password]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
