import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/server-config';

// Exact public paths (no login required)
const PUBLIC_PATHS = new Set([
  '/',
  '/about',
  '/login',
  '/register',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/ships',
  '/vehicles',
  '/components',
  '/ships-components',
  '/paints',
  '/compare',
  '/ranking',
  '/loadout-manager',
  '/fps-gear',
  '/armor',
  '/clothing',
  '/weapons',
  '/utility',
  '/ammo',
  '/sustenance',
  '/consumables',
  '/commodities',
  '/industrial',
  '/trade',
  '/shops',
  '/mining',
  '/minerals',
  '/crafting',
  '/blueprints',
  '/fps-calculator',
  '/mining-calculator',
  '/trade-calculator',
  '/crafting-calculator',
  '/outfitter',
  '/locations',
  '/starmap',
  '/missions',
  '/factions',
  '/manufacturers',
  '/galactapedia',
  '/comm-links',
  '/changelog',
  '/search',
  '/items',
  '/legal',
  '/developer',
  '/discord',
]);

// Public path prefixes — detail pages and sub-routes
const PUBLIC_PREFIXES = [
  '/ships/',
  '/vehicles/',
  '/components/',
  '/ships-components/',
  '/items/',
  '/armor/',
  '/clothing/',
  '/weapons/',
  '/utility/',
  '/ammo/',
  '/sustenance/',
  '/consumables/',
  '/commodities/',
  '/industrial/',
  '/trade/',
  '/shops/',
  '/mining/',
  '/minerals/',
  '/crafting/',
  '/blueprints/',
  '/locations/',
  '/starmap/',
  '/galactapedia/',
  '/comm-links/',
  // Next.js internals & static assets
  '/api/',
  '/_next/',
  '/brand/',
  '/favicon',
  '/robots',
  '/sitemap',
  // API documentation (Swagger UI proxied from backend)
  '/api-docs',
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // Only check cookie presence (JWT signature is validated by the API on each
  // authenticated call — this middleware only handles UX redirection)
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
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
