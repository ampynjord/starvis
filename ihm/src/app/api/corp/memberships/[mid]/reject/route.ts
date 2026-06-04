import { getAuthToken, proxyJson } from '@/app/api/_utils/proxy';

export async function PUT(_req: Request, { params }: { params: Promise<{ mid: string }> }) {
  const token = await getAuthToken();
  if (!token) return Response.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  const { mid } = await params;
  try {
    return proxyJson('PUT', `/corp/memberships/${mid}/reject`, token);
  } catch (e) {
    console.error('[corp/memberships/:mid/reject PUT]', e);
    return Response.json({ success: false, error: 'Proxy error' }, { status: 500 });
  }
}
