import type { NextRequest } from 'next/server';
import { proxyPublicApi } from '../../v1/[...path]/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Proxy vers la surface Nexus sans version (`/api/universe`).
 *
 * Même garde d'origine que v1/v2 — seul le préfixe amont change.
 * L'alias `/api/v2` reste disponible via son propre proxy.
 */
const forward = (req: NextRequest, context: { params: Promise<{ path?: string[] }> }) => proxyPublicApi(req, context, 'universe');

export const GET = forward;
export const POST = forward;
