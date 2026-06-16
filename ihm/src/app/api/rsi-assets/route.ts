import { type NextRequest, NextResponse } from 'next/server';

const ALLOWED_HOSTS = new Set([
  'robertsspaceindustries.com',
  'media.robertsspaceindustries.com',
  'cdn.robertsspaceindustries.com',
  'assets.robertsspaceindustries.com',
  'static.robertsspaceindustries.com',
]);

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url');
  if (!rawUrl) return NextResponse.json({ error: 'Missing url' }, { status: 400 });

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }

  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
    return NextResponse.json({ error: 'Asset host not allowed' }, { status: 400 });
  }

  const upstream = await fetch(url, {
    headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8' },
    cache: 'no-store',
  });
  if (!upstream.ok) return NextResponse.json({ error: 'Asset unavailable' }, { status: upstream.status });

  const contentType = upstream.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    return NextResponse.json({ error: 'Unsupported asset type' }, { status: 415 });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'content-type': contentType,
      'cache-control': 'no-store',
    },
  });
}
