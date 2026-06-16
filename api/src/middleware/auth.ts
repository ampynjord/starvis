import { timingSafeEqual } from 'node:crypto';
import { getPrisma } from '@starvis/db';
import type { NextFunction, Request, Response } from 'express';
import { ApiTokenService } from '../services/api-token-service.js';
import { type JwtPayload, verifyAuthToken } from '../services/auth-service.js';
import { ADMIN_ROLE, AUTH_COOKIE_NAME, DEVELOPER_ACCESS_ROLES } from '../utils/config.js';
import { resolveClientIp } from '../utils/request-ip.js';

// ── Admin API Key ─────────────────────────────────────────────────────────────

// ── JWT Auth ──────────────────────────────────────────────────────────────────

function extractBearer(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

function extractCookieToken(req: Request): string | null {
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  const match = cookie.split(';').find((c) => c.trim().startsWith(`${AUTH_COOKIE_NAME}=`));
  return match ? (match.split('=')[1]?.trim() ?? null) : null;
}

function hasValidAdminApiKey(req: Request): boolean {
  const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
  if (!ADMIN_API_KEY) return false;
  const apiKey = String(req.headers['x-api-key'] || '');
  if (!apiKey) return false;
  const k = Buffer.from(apiKey);
  const e = Buffer.from(ADMIN_API_KEY);
  return k.length === e.length && timingSafeEqual(k, e);
}

async function resolveCurrentPayload(token: string): Promise<JwtPayload> {
  const payload = verifyAuthToken(token);
  const currentUser = await getPrisma().user.findUnique({
    where: { id: payload.sub },
    select: { uuid: true, email: true, username: true, role: true },
  });
  if (!currentUser) return payload;
  return {
    ...payload,
    uuid: currentUser.uuid,
    email: currentUser.email,
    username: currentUser.username,
    role: currentUser.role,
  };
}

async function applyApiTokenState(req: Request, payload: JwtPayload, token: string): Promise<void> {
  if (payload.type !== 'api_token' || !payload.jti) {
    req.authMethod = 'session';
    return;
  }
  const tokenService = new ApiTokenService(getPrisma());
  const tokenRow = await tokenService.validateActive(payload.jti, token);
  if (!tokenRow) throw new Error('INVALID_API_TOKEN');
  req.apiToken = { id: tokenRow.id, jti: tokenRow.jti, name: tokenRow.name, userId: tokenRow.userId };
  req.authMethod = 'api_token';
  await tokenService.touch(payload.jti, { ip: resolveClientIp(req) ?? req.ip, userAgent: requestUserAgent(req) });
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

/**
 * requireJwt — verifies Bearer JWT, injects req.jwtPayload.
 * Accepts any role (user, admin).
 */
export async function requireJwt(req: Request, res: Response, next: NextFunction) {
  if (!process.env.JWT_SECRET) return res.status(500).json({ success: false, error: 'Server misconfiguration: JWT_SECRET not set' });

  const token = extractBearer(req) ?? extractCookieToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  try {
    req.jwtPayload = await resolveCurrentPayload(token);
    await applyApiTokenState(req, req.jwtPayload, token);
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

/**
 * requireExternalApiAccess — protects the documented external /api/v1 surface.
 * A signed-in web session or generated Bearer token is preferred so request logs
 * keep the real user. ADMIN_API_KEY is accepted only for server-side Starvis
 * services such as the public IHM proxy, bot and audits.
 */
export async function requireExternalApiAccess(req: Request, res: Response, next: NextFunction) {
  applyInternalClientMarker(req);
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ success: false, error: 'Server misconfiguration: JWT_SECRET not set' });
  }

  const token = extractBearer(req) ?? extractCookieToken(req);
  if (token) {
    try {
      const payload = await resolveCurrentPayload(token);
      await applyApiTokenState(req, payload, token);
      req.jwtPayload = payload;
      return next();
    } catch {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
  }

  if (hasValidAdminApiKey(req)) {
    req.authMethod = 'admin_key';
    return next();
  }

  return res.status(401).json({ success: false, error: 'API token or signed-in session required' });
}

/**
 * requireJwtDeveloperOrAdmin — verifies Bearer JWT AND that role is developer or admin.
 * Grants access to API token generation and other developer features.
 */
export async function requireJwtDeveloperOrAdmin(req: Request, res: Response, next: NextFunction) {
  if (!process.env.JWT_SECRET) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const token = extractBearer(req) ?? extractCookieToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  try {
    const payload = await resolveCurrentPayload(token);
    const currentRole = payload.role;
    if (!DEVELOPER_ACCESS_ROLES.includes(currentRole as (typeof DEVELOPER_ACCESS_ROLES)[number])) {
      return res.status(403).json({ success: false, error: 'Developer or admin role required' });
    }
    req.jwtPayload = { ...payload, role: currentRole };
    await applyApiTokenState(req, req.jwtPayload, token);
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

/** @deprecated use requireJwtDeveloperOrAdmin */
export const requireJwtBetaOrAdmin = requireJwtDeveloperOrAdmin;

/**
 * requireJwtAdmin — verifies Bearer JWT AND that role === 'admin'.
 * Also accepts ADMIN_API_KEY (X-Api-Key) for server-to-server compatibility.
 */
export async function requireJwtAdmin(req: Request, res: Response, next: NextFunction) {
  // 1. Always accept admin key (backward compat, server scripts)
  if (hasValidAdminApiKey(req)) {
    req.authMethod = 'admin_key';
    return next();
  }

  // 2. Otherwise validate JWT with admin role
  if (!process.env.JWT_SECRET) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const token = extractBearer(req) ?? extractCookieToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  try {
    const payload = await resolveCurrentPayload(token);
    const currentRole = payload.role;
    if (currentRole !== ADMIN_ROLE) {
      return res.status(403).json({ success: false, error: 'Admin role required' });
    }
    req.jwtPayload = { ...payload, role: currentRole };
    await applyApiTokenState(req, req.jwtPayload, token);
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}
