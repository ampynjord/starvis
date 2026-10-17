import { timingSafeEqual } from 'node:crypto';
import { getPrisma } from '@starvis/db';
import type { NextFunction, Request, Response } from 'express';
import { ApiTokenService, verifyApiTokenClaims } from '../services/api-token-service.js';
import { resolveClientIp } from '../utils/request-ip.js';

/**
 * Trois façons d'appeler l'API, et aucune ne passe par un compte :
 *
 *  - `ADMIN_API_KEY` : l'administration (`/admin/*`), et rien d'autre ;
 *  - `SERVER_API_KEY` : les appelants internes de confiance (proxy de l'IHM,
 *    audits de la CI) ;
 *  - un jeton API émis par l'administration, pour les intégrations tierces.
 *
 * `/api/v1` accepte aussi l'appel anonyme, en lecture et sous une limite de
 * débit plus stricte (docs/renaissance.md, décision D2).
 */

function extractBearer(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7).trim() || null;
}

function matchesSecret(candidate: string, secret: string | undefined): boolean {
  if (!candidate || !secret) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function apiKeyHeader(req: Request): string {
  return String(req.headers['x-api-key'] || '');
}

function requestUserAgent(req: Request): string | null {
  const userAgent = req.get('user-agent')?.trim();
  if (!userAgent) return null;
  return userAgent.length > 160 ? `${userAgent.slice(0, 157)}...` : userAgent;
}

function applyInternalClientMarker(req: Request): void {
  if (!process.env.SERVER_API_KEY || req.headers['x-api-key'] !== process.env.SERVER_API_KEY) return;
  const internalClient = String(req.headers['x-starvis-internal-client'] || '').trim();
  if (/^[a-z0-9_-]{1,40}$/i.test(internalClient)) req.internalClient = internalClient;
}

/** Valide un jeton API et l'attache à la requête ; lève une erreur s'il est refusé. */
async function attachApiToken(req: Request, token: string): Promise<void> {
  const claims = verifyApiTokenClaims(token);
  const tokenService = new ApiTokenService(getPrisma());
  const row = await tokenService.validateActive(claims.jti, token);
  if (!row) throw new Error('INVALID_API_TOKEN');
  req.apiToken = { id: row.id, jti: row.jti, name: row.name, owner: row.ownerName };
  req.authMethod = 'api_token';
  await tokenService.touch(claims.jti, { ip: resolveClientIp(req) ?? req.ip, userAgent: requestUserAgent(req) });
}

/**
 * resolveExternalApiAccess — identifie l'appelant de `/api/v1` sans exiger
 * d'identité. Un jeton présenté doit être valide : un jeton refusé ne retombe
 * jamais en accès anonyme, pour qu'un tiers voie que le sien a expiré.
 * `ADMIN_API_KEY` n'est volontairement pas accepté ici.
 */
export async function resolveExternalApiAccess(req: Request, res: Response, next: NextFunction) {
  applyInternalClientMarker(req);

  if (matchesSecret(apiKeyHeader(req), process.env.SERVER_API_KEY)) {
    req.authMethod = 'admin_key';
    return next();
  }

  const token = extractBearer(req);
  if (!token) {
    req.authMethod = 'anonymous';
    return next();
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ success: false, error: 'Server misconfiguration: JWT_SECRET not set' });
  }
  try {
    await attachApiToken(req, token);
    return next();
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid, revoked or expired API token' });
  }
}

/**
 * requireInternalOrAdmin — protège les routes coûteuses (assistant IA).
 * Acceptés : `SERVER_API_KEY` (proxy de l'IHM) et `ADMIN_API_KEY` (bot Discord).
 */
export function requireInternalOrAdmin(req: Request, res: Response, next: NextFunction) {
  const apiKey = apiKeyHeader(req);
  if (!apiKey) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (matchesSecret(apiKey, process.env.SERVER_API_KEY) || matchesSecret(apiKey, process.env.ADMIN_API_KEY)) {
    applyInternalClientMarker(req);
    req.authMethod = 'admin_key';
    return next();
  }
  return res.status(403).json({ success: false, error: 'Forbidden' });
}

/** requireAdminKey — `/admin/*`, accessible avec `ADMIN_API_KEY` seulement. */
export function requireAdminKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = apiKeyHeader(req);
  if (!apiKey) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (!matchesSecret(apiKey, process.env.ADMIN_API_KEY)) {
    return res.status(401).json({ success: false, error: 'Invalid admin API key' });
  }
  req.authMethod = 'admin_key';
  return next();
}
