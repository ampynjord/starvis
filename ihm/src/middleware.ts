import { jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Chemins publics (pas de connexion requise)
const PUBLIC_PATHS = ['/login', '/register'];

// Préfixes toujours accessibles (assets, API Next.js, Next.js internals)
const PUBLIC_PREFIXES = [
  '/api/',        // route handlers Next.js (auth, chat proxy…)
  '/_next/',      // assets Next.js
  '/favicon',
  '/robots',
  '/sitemap',
];

function getSecret(): Uint8Array | null {
  const s = process.env.JWT_SECRET;
  if (!s) return null;
  return new TextEncoder().encode(s);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Laisser passer les chemins publics
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const secret = getSecret();
  // Si JWT_SECRET non configuré, on laisse tout passer (mode dégradé)
  if (!secret) return NextResponse.next();

  const token = req.cookies.get('starvis_token')?.value;
  if (!token) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    const res = NextResponse.redirect(loginUrl);
    res.cookies.delete('starvis_token');
    return res;
  }
}

export const config = {
  // Matcher : tout sauf les fichiers statiques gérés par Next.js
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
