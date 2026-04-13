import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Chemins publics (pas de connexion requise)
const PUBLIC_PATHS = ['/login', '/register'];

// Préfixes toujours accessibles (assets Next.js, route handlers API interne)
const PUBLIC_PREFIXES = [
  '/api/',
  '/_next/',
  '/favicon',
  '/robots',
  '/sitemap',
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // Vérification de présence du cookie uniquement (la signature JWT est validée
  // côté API sur chaque appel authentifié — le middleware gère uniquement la redirection UX)
  const token = req.cookies.get('starvis_token')?.value;
  if (!token) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
