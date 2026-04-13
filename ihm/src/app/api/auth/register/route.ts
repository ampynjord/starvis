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
    try { data = JSON.parse(text); } catch { /* empty body */ }

    if (!upstream.ok) {
      return NextResponse.json({ error: data.error ?? 'Registration failed' }, { status: upstream.status });
    }

    const res = NextResponse.json({ user: data.user });
    res.cookies.set('starvis_token', data.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });
    return res;
  } catch (e: any) {
    console.error('[auth/register]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
