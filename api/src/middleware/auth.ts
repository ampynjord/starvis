import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { AuthService } from '../services/auth-service.js';

// ── Admin API Key ─────────────────────────────────────────────────────────────

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
  if (!ADMIN_API_KEY) return res.status(500).json({ error: 'Server misconfiguration' });

  const apiKey = String(req.headers['x-api-key'] || '');
  const keyBuf = Buffer.from(apiKey);
  const expectedBuf = Buffer.from(ADMIN_API_KEY);

  if (!apiKey || keyBuf.length !== expectedBuf.length || !timingSafeEqual(keyBuf, expectedBuf)) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid API key required. Use X-API-Key header.',
    });
  }

  next();
}

// ── JWT Auth ──────────────────────────────────────────────────────────────────

function extractBearer(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

/**
 * requireJwt — vérifie le Bearer JWT, injecte req.jwtPayload.
 * Accepte n'importe quel rôle (user, admin).
 */
export function requireJwt(req: Request, res: Response, next: NextFunction) {
  if (!process.env.JWT_SECRET) return next(); // JWT désactivé → pas de blocage

  const token = extractBearer(req);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  try {
    const authService = new AuthService(null as any); // verifyToken n'utilise pas prisma
    (req as any).jwtPayload = authService.verifyToken(token);
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

/**
 * requireJwtAdmin — vérifie le Bearer JWT ET que role === 'admin'.
 * Accepte aussi l'ADMIN_API_KEY (X-Api-Key) pour la compatibilité serveur-to-serveur.
 */
export function requireJwtAdmin(req: Request, res: Response, next: NextFunction) {
  // 1. Toujours accepter la clé admin (backward compat, scripts serveur)
  const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
  if (ADMIN_API_KEY) {
    const apiKey = String(req.headers['x-api-key'] || '');
    if (apiKey.length > 0) {
      const k = Buffer.from(apiKey);
      const e = Buffer.from(ADMIN_API_KEY);
      if (k.length === e.length && timingSafeEqual(k, e)) return next();
    }
  }

  // 2. Sinon valider le JWT avec role admin
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
    if (payload.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin role required' });
    }
    (req as any).jwtPayload = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}
