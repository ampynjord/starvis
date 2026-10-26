import type { NextRequest } from 'next/server';
import { proxyPublicApi } from '../../v1/[...path]/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Proxy vers le chemin canonique `/api/universe`, même fonction que v1 et v2. */
const forward = (req: NextRequest, context: { params: Promise<{ path?: string[] }> }) => proxyPublicApi(req, context, 'universe');

export const GET = forward;
export const POST = forward;
