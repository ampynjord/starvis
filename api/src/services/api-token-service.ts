import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient, UserRole } from '@starvis/db';
import jwt from 'jsonwebtoken';
import { JWT_API_TOKEN_EXPIRES } from '../utils/config.js';

const DEFAULT_TOKEN_NAME = 'External project token';

/**
 * Ce que signe un jeton API.
 *
 * Les jetons émis avant le retrait des comptes portent aussi `sub`, `username`
 * et `role` : ils restent valides, mais rien ne s'y fie plus. Le propriétaire et
 * le rôle se lisent sur la ligne en base, qui seule peut être révoquée.
 */
export interface ApiTokenClaims {
  type: 'api_token';
  jti: string;
}

export interface ApiTokenPublic {
  id: number;
  jti: string;
  name: string;
  description: string | null;
  ownerName: string;
  userId: number | null;
  roleSnapshot: UserRole;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
  lastUserAgent: string | null;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set');
  return secret;
}

/** Vérifie la signature et la forme ; l'état (révoqué, expiré) se lit en base. */
export function verifyApiTokenClaims(token: string): ApiTokenClaims {
  const payload = jwt.verify(token, getSecret()) as Partial<ApiTokenClaims>;
  if (payload.type !== 'api_token' || typeof payload.jti !== 'string' || !payload.jti) {
    throw new Error('INVALID_API_TOKEN');
  }
  return { type: 'api_token', jti: payload.jti };
}

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function normalizeApiTokenOwner(owner: unknown): string | null {
  if (typeof owner !== 'string') return null;
  const trimmed = owner.trim().replace(/\s+/g, ' ');
  return trimmed ? trimmed.slice(0, 120) : null;
}

export function normalizeApiTokenName(name: unknown): string {
  if (typeof name !== 'string') return DEFAULT_TOKEN_NAME;
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return DEFAULT_TOKEN_NAME;
  return trimmed.slice(0, 120);
}

export function normalizeApiTokenDescription(description: unknown): string | null {
  if (typeof description !== 'string') return null;
  const trimmed = description.trim().replace(/\s+/g, ' ');
  return trimmed ? trimmed.slice(0, 500) : null;
}

export function apiTokenExpiryFromNow(expiresIn: string | number): Date {
  if (typeof expiresIn === 'number') return new Date(Date.now() + expiresIn * 1000);
  const match = String(expiresIn)
    .trim()
    .match(/^(\d+)\s*([smhdwy])$/i);
  if (!match) return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const seconds =
    unit === 's'
      ? value
      : unit === 'm'
        ? value * 60
        : unit === 'h'
          ? value * 60 * 60
          : unit === 'd'
            ? value * 24 * 60 * 60
            : unit === 'w'
              ? value * 7 * 24 * 60 * 60
              : value * 365 * 24 * 60 * 60;
  return new Date(Date.now() + seconds * 1000);
}

export class ApiTokenService {
  constructor(private prisma: Pick<PrismaClient, 'apiToken'>) {}

  /**
   * Émet un jeton pour un tiers nommé. Réservé à l'administration : il n'y a
   * plus de compte pour s'en générer un soi-même.
   */
  async issue(data: { ownerName: string; name?: string | null; description?: string | null }): Promise<{
    token: string;
    row: ApiTokenPublic;
  }> {
    const jti = randomBytes(16).toString('hex');
    const claims: ApiTokenClaims = { type: 'api_token', jti };
    const token = jwt.sign(claims, getSecret(), { expiresIn: JWT_API_TOKEN_EXPIRES });
    const row = await this.prisma.apiToken.create({
      data: {
        jti,
        tokenHash: hashApiToken(token),
        name: normalizeApiTokenName(data.name),
        description: normalizeApiTokenDescription(data.description),
        ownerName: data.ownerName,
        roleSnapshot: 'developer',
        expiresAt: apiTokenExpiryFromNow(JWT_API_TOKEN_EXPIRES as string | number),
      },
    });
    return { token, row };
  }

  async validateActive(jti: string, token: string): Promise<ApiTokenPublic | null> {
    const row = await this.prisma.apiToken.findUnique({ where: { jti } });
    if (!row) return null;
    if (row.tokenHash !== hashApiToken(token)) return null;
    if (row.revokedAt || row.expiresAt <= new Date()) return null;
    return row;
  }

  async touch(jti: string, context: { ip?: string | null; userAgent?: string | null }): Promise<void> {
    await this.prisma.apiToken.updateMany({
      where: { jti, revokedAt: null, expiresAt: { gt: new Date() } },
      data: {
        lastUsedAt: new Date(),
        lastUsedIp: context.ip?.slice(0, 80) ?? null,
        lastUserAgent: context.userAgent?.slice(0, 160) ?? null,
        usageCount: { increment: 1 },
      },
    });
  }

  private normalizeLimit(limit = 200): number {
    return Math.min(Math.max(Math.trunc(limit) || 200, 1), 500);
  }

  async listForAdmin(limit = 200): Promise<ApiTokenPublic[]> {
    return this.prisma.apiToken.findMany({
      take: this.normalizeLimit(limit),
      orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async revokeForAdmin(tokenId: number): Promise<ApiTokenPublic | null> {
    const result = await this.prisma.apiToken.updateMany({
      where: { id: tokenId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) return null;
    return this.prisma.apiToken.findUnique({ where: { id: tokenId } });
  }
}
