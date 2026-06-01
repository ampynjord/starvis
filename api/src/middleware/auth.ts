import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { AuthService } from '../services/auth-service.js';
import { ADMIN_ROLE, AUTH_COOKIE_NAME, BETA_ACCESS_ROLES } from '../utils/config.js';

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

/**
 * requireJwt — verifies Bearer JWT, injects req.jwtPayload.
 * Accepts any role (user, admin).
 */
export function requireJwt(req: Request, res: Response, next: NextFunction) {
  if (!process.env.JWT_SECRET) return res.status(500).json({ success: false, error: 'Server misconfiguration: JWT_SECRET not set' });

  const token = extractBearer(req) ?? extractCookieToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  try {
    const authService = new AuthService(null as any); // verifyToken does not use prisma
    (req as any).jwtPayload = authService.verifyToken(token);
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

/**
 * requireJwtBetaOrAdmin — verifies Bearer JWT AND that role is beta_tester or admin.
 * Grants access to early-access (beta) features.
 */
export function requireJwtBetaOrAdmin(req: Request, res: Response, next: NextFunction) {
  if (!process.env.JWT_SECRET) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const token = extractBearer(req) ?? extractCookieToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  try {
    const authService = new AuthService(null as any);
    const payload = authService.verifyToken(token);
    if (!BETA_ACCESS_ROLES.includes(payload.role as (typeof BETA_ACCESS_ROLES)[number])) {
      return res.status(403).json({ success: false, error: 'Beta tester or admin role required' });
    }
    (req as any).jwtPayload = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

/**
 * requireJwtAdmin — verifies Bearer JWT AND that role === 'admin'.
 * Also accepts ADMIN_API_KEY (X-Api-Key) for server-to-server compatibility.
 */
export function requireJwtAdmin(req: Request, res: Response, next: NextFunction) {
  // 1. Always accept admin key (backward compat, server scripts)
  const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
  if (ADMIN_API_KEY) {
    const apiKey = String(req.headers['x-api-key'] || '');
    if (apiKey.length > 0) {
      const k = Buffer.from(apiKey);
      const e = Buffer.from(ADMIN_API_KEY);
      if (k.length === e.length && timingSafeEqual(k, e)) return next();
    }
  }

  // 2. Otherwise validate JWT with admin role
  if (!process.env.JWT_SECRET) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const token = extractBearer(req);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  try {
    const authService = new AuthService(null as any);
    const payload = authService.verifyToken(token);
    if (payload.role !== ADMIN_ROLE) {
      return res.status(403).json({ success: false, error: 'Admin role required' });
    }
    (req as any).jwtPayload = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}
