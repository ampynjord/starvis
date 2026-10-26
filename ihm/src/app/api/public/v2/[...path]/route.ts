import type { NextRequest } from 'next/server';
import { proxyPublicApi } from '../../v1/[...path]/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Le proxy vers `/api/v2`.
 *
 * Même garde d'origine, même clé serveur, même transfert d'en-têtes que la v1 —
 * seul le préfixe amont change. Recopier le proxy les aurait laissés diverger.
 */
const forward = (req: NextRequest, context: { params: Promise<{ path?: string[] }> }) => proxyPublicApi(req, context, 'v2');

export const GET = forward;
export const POST = forward;
