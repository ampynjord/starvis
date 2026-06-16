import { NextResponse } from 'next/server';
import { logApiError } from '@/lib/server-logger';
import { getAuthToken, proxyJson } from '../../_utils/proxy';

export async function GET(req: Request) {
  try {
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const url = new URL(req.url);
    const includeRevoked = url.searchParams.get('includeRevoked') ?? 'true';
    const limit = url.searchParams.get('limit') ?? '100';
    return proxyJson(
      'GET',
      `/auth/api-tokens?includeRevoked=${encodeURIComponent(includeRevoked)}&limit=${encodeURIComponent(limit)}`,
      token,
    );
  } catch (e) {
    logApiError('auth/api-tokens GET', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
