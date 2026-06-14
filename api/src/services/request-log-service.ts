import type { Request } from 'express';
import { AUTH_COOKIE_NAME } from '../utils/config.js';
import { type JwtPayload, verifyAuthToken } from './auth-service.js';

export interface RequestLogEntry {
  id: number;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  isExternalApi: boolean;
  authMethod: 'admin_key' | 'api_token' | 'session' | 'anonymous' | 'unknown';
  clientType: 'external_api' | 'web_session' | 'internal_web_proxy' | 'server_key' | 'anonymous_web' | 'unknown';
  internalClient: string | null;
  apiTokenId: number | null;
  apiTokenName: string | null;
  userId: number | null;
  username: string | null;
  role: string | null;
  ip: string | null;
  userAgent: string | null;
}

const DEFAULT_BUFFER_SIZE = 500;
const MAX_LIMIT = 500;
const requestLogs: RequestLogEntry[] = [];
let nextId = 1;

function bufferSize(): number {
  const parsed = Number.parseInt(process.env.REQUEST_LOG_BUFFER_SIZE ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_BUFFER_SIZE;
  return Math.min(Math.max(parsed, 50), 5_000);
}

function anonymizeIp(ip: string | undefined): string | null {
  if (!ip) return null;
  const normalized = ip.replace(/^::ffff:/, '');
  const ipv4Parts = normalized.split('.');
  if (ipv4Parts.length === 4) return `${ipv4Parts[0]}.${ipv4Parts[1]}.${ipv4Parts[2]}.0`;
  const ipv6Parts = normalized.split(':');
  if (ipv6Parts.length > 2) return `${ipv6Parts.slice(0, 4).join(':')}::`;
  return normalized;
}

function requestPath(req: Request): string {
  return (req.originalUrl || req.url).split('?')[0] || '/';
}

function requestUserAgent(req: Request): string | null {
  const userAgent = req.get('user-agent')?.trim();
  if (!userAgent) return null;
  return userAgent.length > 160 ? `${userAgent.slice(0, 157)}...` : userAgent;
}

function shouldRecordRequestLog(path: string): boolean {
  return path !== '/admin/request-logs' && path !== '/admin/api-supervision';
}

function isExternalApiPath(path: string): boolean {
  return path === '/api/v1' || path.startsWith('/api/v1/');
}

function requestInternalClient(req: Request): string | null {
  return req.internalClient ?? null;
}

function resolveAuthMethod(req: Request, payload: JwtPayload | null): RequestLogEntry['authMethod'] {
  if (req.authMethod) return req.authMethod;
  if (payload) return payload.type === 'api_token' ? 'api_token' : 'session';
  return 'anonymous';
}

function resolveClientType(
  path: string,
  authMethod: RequestLogEntry['authMethod'],
  payload: JwtPayload | null,
  internalClient: string | null,
): RequestLogEntry['clientType'] {
  if (internalClient) return 'internal_web_proxy';
  if (authMethod === 'admin_key') return 'server_key';
  if (isExternalApiPath(path) && authMethod === 'api_token') return 'external_api';
  if (payload || authMethod === 'session') return 'web_session';
  if (!isExternalApiPath(path)) return 'anonymous_web';
  return 'unknown';
}

function isExternalApiLog(path: string, clientType: RequestLogEntry['clientType']): boolean {
  return isExternalApiPath(path) && (clientType === 'external_api' || clientType === 'server_key');
}

function extractBearer(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7).trim() || null;
}

function extractCookieToken(req: Request): string | null {
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  const match = cookie.split(';').find((c) => c.trim().startsWith(`${AUTH_COOKIE_NAME}=`));
  const rawToken = match?.split('=').slice(1).join('=').trim();
  if (!rawToken) return null;
  try {
    return decodeURIComponent(rawToken);
  } catch {
    return rawToken;
  }
}

function resolveRequestActor(req: Request): JwtPayload | null {
  if (req.jwtPayload?.sub) return req.jwtPayload;
  const token = extractBearer(req) ?? extractCookieToken(req);
  if (!token || !process.env.JWT_SECRET) return null;
  try {
    return verifyAuthToken(token);
  } catch {
    return null;
  }
}

export function recordRequestLog(req: Request, statusCode: number, durationMs: number): void {
  const path = requestPath(req);
  if (!shouldRecordRequestLog(path)) return;
  const payload = resolveRequestActor(req);
  const authMethod = resolveAuthMethod(req, payload);
  const internalClient = requestInternalClient(req);
  const clientType = resolveClientType(path, authMethod, payload, internalClient);
  requestLogs.unshift({
    id: nextId++,
    timestamp: new Date().toISOString(),
    method: req.method,
    path,
    statusCode,
    durationMs: Math.max(0, Math.round(durationMs)),
    isExternalApi: isExternalApiLog(path, clientType),
    authMethod,
    clientType,
    internalClient,
    apiTokenId: req.apiToken?.id ?? null,
    apiTokenName: req.apiToken?.name ?? null,
    userId: typeof payload?.sub === 'number' ? payload.sub : null,
    username: payload?.username ?? null,
    role: payload?.role ?? null,
    ip: anonymizeIp(req.ip),
    userAgent: requestUserAgent(req),
  });

  const max = bufferSize();
  if (requestLogs.length > max) requestLogs.length = max;
}

export function listRequestLogs(limit = 100): RequestLogEntry[] {
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 100, 1), MAX_LIMIT);
  return requestLogs.slice(0, safeLimit);
}

export function clearRequestLogsForTests(): void {
  requestLogs.length = 0;
  nextId = 1;
}
