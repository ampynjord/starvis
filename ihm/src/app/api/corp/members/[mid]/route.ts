import { getAuthToken, proxyJson } from '@/app/api/_utils/proxy';

export async function DELETE(_req: Request, { params }: { params: Promise<{ mid: string }> }) {
  const token = await getAuthToken();
  if (!token) return Response.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  const { mid } = await params;
  try {
    return proxyJson('DELETE', `/corp/members/${mid}`, token);
  } catch (e) {
    console.error('[corp/members/:mid DELETE]', e);
    return Response.json({ success: false, error: 'Proxy error' }, { status: 500 });
  }
}
