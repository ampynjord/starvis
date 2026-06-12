import { NextResponse } from 'next/server';
import { logApiError } from '@/lib/server-logger';
import { getAuthToken, proxyJson } from '../../../../_utils/proxy';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    return proxyJson('GET', `/admin/users/${id}/corporation`, token);
  } catch (e: any) {
    logApiError('admin/users/:id/corporation GET', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    return proxyJson('PUT', `/admin/users/${id}/corporation`, token, body);
  } catch (e: any) {
    logApiError('admin/users/:id/corporation PUT', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = await getAuthToken();
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    return proxyJson('DELETE', `/admin/users/${id}/corporation`, token);
  } catch (e: any) {
    logApiError('admin/users/:id/corporation DELETE', e);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
