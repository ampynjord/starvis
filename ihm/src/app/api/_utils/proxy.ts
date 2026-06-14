import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, SERVER_API_KEY, SERVER_API_URL, SESSION_COOKIE_MAX_AGE_SECONDS } from '@/lib/server-config';

export async function getAuthToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIE_NAME)?.value ?? null;
}

export async function readUpstreamJson(upstream: Response): Promise<any> {
  const text = await upstream.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: 'Upstream returned a non-JSON response' };
  }
}

export function upstreamUrl(path: string): string {
  return `${SERVER_API_URL}${path}`;
}

export async function serverApiHeaders(includeJson = false): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const token = await getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (SERVER_API_KEY) headers['X-API-Key'] = SERVER_API_KEY;
  if (SERVER_API_KEY) headers['X-Starvis-Internal-Client'] = 'ihm-route-handler';
  if (includeJson) headers['Content-Type'] = 'application/json';
  return headers;
}

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    path: '/',
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.delete(AUTH_COOKIE_NAME);
}

export async function proxyJson(method: string, path: string, token: string, body?: unknown): Promise<NextResponse> {
  const upstream = await fetch(upstreamUrl(path), {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await readUpstreamJson(upstream);
  return NextResponse.json(data, { status: upstream.status });
}
