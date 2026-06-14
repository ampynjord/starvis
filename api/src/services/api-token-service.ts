import { createHash } from 'node:crypto';
import type { PrismaClient, UserRole } from '@starvis/db';

const DEFAULT_TOKEN_NAME = 'External project token';

export interface ApiTokenPublic {
  id: number;
  jti: string;
  name: string;
  description: string | null;
  userId: number;
  roleSnapshot: UserRole;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
  lastUserAgent: string | null;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
  user?: {
    id: number;
    username: string;
    email: string;
    role: UserRole;
  };
}

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
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

  async create(data: {
    jti: string;
    token: string;
    name: string;
    description?: string | null;
    userId: number;
    roleSnapshot: UserRole;
    expiresAt: Date;
  }): Promise<ApiTokenPublic> {
    return this.prisma.apiToken.create({
      data: {
        jti: data.jti,
        tokenHash: hashApiToken(data.token),
        name: normalizeApiTokenName(data.name),
        description: normalizeApiTokenDescription(data.description),
        userId: data.userId,
        roleSnapshot: data.roleSnapshot,
        expiresAt: data.expiresAt,
      },
    });
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

  async listForAdmin(limit = 200): Promise<ApiTokenPublic[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit) || 200, 1), 500);
    return this.prisma.apiToken.findMany({
      take: safeLimit,
      orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
      include: { user: { select: { id: true, username: true, email: true, role: true } } },
    });
  }
}
