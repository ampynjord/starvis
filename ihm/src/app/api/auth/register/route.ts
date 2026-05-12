import { NextResponse } from 'next/server';

const API_BASE = process.env.API_URL ?? 'http://localhost:3000';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const upstream = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      /* empty body */
    }

    if (!upstream.ok) {
      return NextResponse.json({ error: data.error ?? 'Registration failed' }, { status: upstream.status });
    }

    // Email verification required — no token, no cookie
    return NextResponse.json({ requiresVerification: true });
  } catch (e: any) {
    const msg = e?.cause?.code ?? e?.message ?? String(e);
    console.error('[auth/register]', API_BASE, msg);
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json({ error: isDev ? `API unreachable (${API_BASE}): ${msg}` : 'Service unavailable' }, { status: 503 });
  }
}
