import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const API_BASE = process.env.API_URL ?? 'http://localhost:3000';

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get('starvis_token')?.value ?? null;
}

async function proxy(method: string, path: string, token: string, body?: unknown) {
  const upstream = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await upstream.text();
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* empty */
  }
  return NextResponse.json(data, { status: upstream.status });
}

export async function GET() {
  try {
    const token = await getToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    return proxy('GET', '/admin/users', token);
  } catch (e: any) {
    console.error('[admin/users GET]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}

export async function POST(req: Request) {
  try {
    const token = await getToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    return proxy('POST', '/admin/users', token, body);
  } catch (e: any) {
    console.error('[admin/users POST]', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
