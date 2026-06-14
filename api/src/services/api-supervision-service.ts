import type { PrismaClient, UserRole } from '@starvis/db';
import { type ApiTokenPublic, ApiTokenService } from './api-token-service.js';
import { listRequestLogs, type RequestLogEntry } from './request-log-service.js';

const ACTIVE_WINDOW_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ApiSupervisionUser {
  userId: number;
  username: string | null;
  role: string | null;
  lastSeenAt: string;
  requestCount: number;
  externalApiRequests: number;
  webRequests: number;
}

export interface ApiSupervisionProject {
  tokenId: number;
  name: string;
  description: string | null;
  owner: {
    id: number;
    username: string;
    email: string;
    role: UserRole;
  } | null;
  status: 'active' | 'expired' | 'revoked';
  connected: boolean;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  usageCount: number;
  requestsInBuffer: number;
  recentRequests: number;
  lastUsedIp: string | null;
  lastUserAgent: string | null;
}

export interface ApiSupervisionSummary {
  externalApiRequests15m: number;
  externalApiRequests24h: number;
  serverKeyRequests15m: number;
  activeUsers15m: number;
  generatedTokens: number;
  activeTokens: number;
  revokedTokens: number;
  expiredTokens: number;
  tokensUsed24h: number;
  connectedProjects: number;
}

export interface ApiSupervisionSnapshot {
  generatedAt: string;
  summary: ApiSupervisionSummary;
  activeUsers: ApiSupervisionUser[];
  projects: ApiSupervisionProject[];
  recentExternalRequests: RequestLogEntry[];
}

function toTime(value: string | Date | null): number {
  if (!value) return 0;
  return new Date(value).getTime();
}

function tokenStatus(token: ApiTokenPublic, now = Date.now()): ApiSupervisionProject['status'] {
  if (token.revokedAt) return 'revoked';
  if (token.expiresAt.getTime() <= now) return 'expired';
  return 'active';
}

function buildActiveUsers(logs: RequestLogEntry[], since: number): ApiSupervisionUser[] {
  const grouped = new Map<number, ApiSupervisionUser>();
  for (const log of logs) {
    if (!log.userId || toTime(log.timestamp) < since) continue;
    const current = grouped.get(log.userId) ?? {
      userId: log.userId,
      username: log.username,
      role: log.role,
      lastSeenAt: log.timestamp,
      requestCount: 0,
      externalApiRequests: 0,
      webRequests: 0,
    };
    current.username = log.username ?? current.username;
    current.role = log.role ?? current.role;
    if (toTime(log.timestamp) > toTime(current.lastSeenAt)) current.lastSeenAt = log.timestamp;
    current.requestCount += 1;
    if (log.isExternalApi) current.externalApiRequests += 1;
    if (log.clientType === 'web_session' || log.clientType === 'anonymous_web') current.webRequests += 1;
    grouped.set(log.userId, current);
  }
  return [...grouped.values()].sort((a, b) => toTime(b.lastSeenAt) - toTime(a.lastSeenAt));
}

function buildProjects(tokens: ApiTokenPublic[], logs: RequestLogEntry[], since: number, now = Date.now()): ApiSupervisionProject[] {
  return tokens.map((token) => {
    const tokenLogs = logs.filter((log) => log.apiTokenId === token.id);
    const recentRequests = tokenLogs.filter((log) => toTime(log.timestamp) >= since).length;
    const status = tokenStatus(token, now);
    return {
      tokenId: token.id,
      name: token.name,
      description: token.description,
      owner: token.user
        ? {
            id: token.user.id,
            username: token.user.username,
            email: token.user.email,
            role: token.user.role,
          }
        : null,
      status,
      connected: status === 'active' && (recentRequests > 0 || toTime(token.lastUsedAt) >= since),
      createdAt: token.createdAt.toISOString(),
      expiresAt: token.expiresAt.toISOString(),
      revokedAt: token.revokedAt?.toISOString() ?? null,
      lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
      usageCount: token.usageCount,
      requestsInBuffer: tokenLogs.length,
      recentRequests,
      lastUsedIp: token.lastUsedIp,
      lastUserAgent: token.lastUserAgent,
    };
  });
}

export async function buildApiSupervisionSnapshot(prisma: Pick<PrismaClient, 'apiToken'>): Promise<ApiSupervisionSnapshot> {
  const now = Date.now();
  const activeSince = now - ACTIVE_WINDOW_MS;
  const daySince = now - DAY_MS;
  const logs = listRequestLogs(500);
  const tokens = await new ApiTokenService(prisma).listForAdmin(500);
  const projects = buildProjects(tokens, logs, activeSince, now);

  const summary: ApiSupervisionSummary = {
    externalApiRequests15m: logs.filter((log) => log.isExternalApi && toTime(log.timestamp) >= activeSince).length,
    externalApiRequests24h: logs.filter((log) => log.isExternalApi && toTime(log.timestamp) >= daySince).length,
    serverKeyRequests15m: logs.filter((log) => log.authMethod === 'admin_key' && toTime(log.timestamp) >= activeSince).length,
    activeUsers15m: buildActiveUsers(logs, activeSince).length,
    generatedTokens: tokens.length,
    activeTokens: projects.filter((project) => project.status === 'active').length,
    revokedTokens: projects.filter((project) => project.status === 'revoked').length,
    expiredTokens: projects.filter((project) => project.status === 'expired').length,
    tokensUsed24h: tokens.filter((token) => toTime(token.lastUsedAt) >= daySince).length,
    connectedProjects: projects.filter((project) => project.connected).length,
  };

  return {
    generatedAt: new Date(now).toISOString(),
    summary,
    activeUsers: buildActiveUsers(logs, activeSince),
    projects,
    recentExternalRequests: logs.filter((log) => log.isExternalApi).slice(0, 80),
  };
}
