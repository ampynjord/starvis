import type { Request } from 'express';
import { AUTH_COOKIE_NAME } from '../utils/config.js';
import { anonymizeIp, resolveClientIp } from '../utils/request-ip.js';
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
let persistenceClient: {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
  $queryRawUnsafe: <T = unknown>(query: string, ...values: unknown[]) => Promise<T>;
} | null = null;
let persistenceWarningPrinted = false;

export function configureRequestLogPersistence(
  client: {
    $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
    $queryRawUnsafe: <T = unknown>(query: string, ...values: unknown[]) => Promise<T>;
  } | null,
): void {
  persistenceClient = client;
}

function bufferSize(): number {
  const parsed = Number.parseInt(process.env.REQUEST_LOG_BUFFER_SIZE ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_BUFFER_SIZE;
  return Math.min(Math.max(parsed, 50), 5_000);
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
  const entry: RequestLogEntry = {
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
    ip: anonymizeIp(resolveClientIp(req)),
    userAgent: requestUserAgent(req),
  };
  requestLogs.unshift(entry);
  void persistRequestLog(entry);

  const max = bufferSize();
  if (requestLogs.length > max) requestLogs.length = max;
}

async function persistRequestLog(entry: RequestLogEntry): Promise<void> {
  if (!persistenceClient) return;
  try {
    await persistenceClient.$executeRawUnsafe(
      `INSERT INTO meta.user_request_history
        (timestamp, method, path, status_code, duration_ms, is_external_api, auth_method, client_type,
         internal_client, api_token_id, api_token_name, user_id, username, role, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::meta."UserRole", $15, $16)`,
      new Date(entry.timestamp),
      entry.method,
      entry.path,
      entry.statusCode,
      entry.durationMs,
      entry.isExternalApi,
      entry.authMethod,
      entry.clientType,
      entry.internalClient,
      entry.apiTokenId,
      entry.apiTokenName,
      entry.userId,
      entry.username,
      entry.role,
      entry.ip,
      entry.userAgent,
    );
  } catch (error) {
    if (!persistenceWarningPrinted) {
      persistenceWarningPrinted = true;
      console.warn(`Request history persistence disabled: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export function listRequestLogs(limit = 100): RequestLogEntry[] {
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 100, 1), MAX_LIMIT);
  return requestLogs.slice(0, safeLimit);
}

export function listRequestLogsByScope(scope: 'external' | 'web' | 'all', limit = 100): RequestLogEntry[] {
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 100, 1), MAX_LIMIT);
  const filtered =
    scope === 'external'
      ? requestLogs.filter((log) => log.isExternalApi)
      : scope === 'web'
        ? requestLogs.filter((log) => !log.isExternalApi && ['web_session', 'internal_web_proxy', 'anonymous_web'].includes(log.clientType))
        : requestLogs;
  return filtered.slice(0, safeLimit);
}

interface RequestHistoryFilters {
  scope?: 'external' | 'web' | 'all';
  limit?: number;
  userId?: number;
  role?: string;
}

interface RequestHistoryRow {
  id: number;
  timestamp: Date | string;
  method: string;
  path: string;
  status_code: number;
  duration_ms: number;
  is_external_api: boolean;
  auth_method: RequestLogEntry['authMethod'];
  client_type: RequestLogEntry['clientType'];
  internal_client: string | null;
  api_token_id: number | null;
  api_token_name: string | null;
  user_id: number | null;
  username: string | null;
  role: string | null;
  ip: string | null;
  user_agent: string | null;
}

export async function listPersistedRequestHistory(filters: RequestHistoryFilters = {}): Promise<RequestLogEntry[]> {
  const scope = filters.scope ?? 'all';
  const limit = Math.min(Math.max(Math.trunc(filters.limit ?? 100) || 100, 1), MAX_LIMIT);

  if (!persistenceClient) {
    return listRequestLogsByScope(scope, limit);
  }

  const where: string[] = [];
  const values: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    where.push(sql.replace('?', `$${values.length + 1}`));
    values.push(value);
  };

  if (scope === 'external') {
    where.push('is_external_api = true');
  } else if (scope === 'web') {
    where.push("is_external_api = false AND client_type IN ('web_session', 'internal_web_proxy', 'anonymous_web')");
  }
  if (filters.userId) add('user_id = ?', filters.userId);
  if (filters.role) add('role = ?::meta."UserRole"', filters.role);

  values.push(limit);
  const limitRef = `$${values.length}`;
  const rows = await persistenceClient.$queryRawUnsafe<RequestHistoryRow[]>(
    `SELECT id, timestamp, method, path, status_code, duration_ms, is_external_api,
            auth_method, client_type, internal_client, api_token_id, api_token_name,
            user_id, username, role, ip, user_agent
     FROM meta.user_request_history
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY timestamp DESC
     LIMIT ${limitRef}`,
    ...values,
  );

  return rows.map((row) => ({
    id: Number(row.id),
    timestamp: new Date(row.timestamp).toISOString(),
    method: row.method,
    path: row.path,
    statusCode: Number(row.status_code),
    durationMs: Number(row.duration_ms),
    isExternalApi: Boolean(row.is_external_api),
    authMethod: row.auth_method,
    clientType: row.client_type,
    internalClient: row.internal_client,
    apiTokenId: row.api_token_id == null ? null : Number(row.api_token_id),
    apiTokenName: row.api_token_name,
    userId: row.user_id == null ? null : Number(row.user_id),
    username: row.username,
    role: row.role,
    ip: row.ip,
    userAgent: row.user_agent,
  }));
}

export function clearRequestLogsForTests(): void {
  requestLogs.length = 0;
  nextId = 1;
}
