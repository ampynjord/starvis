import type { NextRequest } from 'next/server';
import { proxyPublicApi } from '../../v1/[...path]/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Proxy de compatibilité vers l'alias `/api/v2` (Nexus).
 *
 * Le chemin canonique est `/api/universe` (`public/universe`). Même garde
 * d'origine, même clé serveur, même transfert d'en-têtes — seul le préfixe
 * amont change.
 */
const forward = (req: NextRequest, context: { params: Promise<{ path?: string[] }> }) => proxyPublicApi(req, context, 'v2');

export const GET = forward;
export const POST = forward;
