import type { Request } from 'express';

export interface RequestLogEntry {
  id: number;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  userId: number | null;
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

export function recordRequestLog(req: Request, statusCode: number, durationMs: number): void {
  const payload = req.jwtPayload;
  requestLogs.unshift({
    id: nextId++,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: requestPath(req),
    statusCode,
    durationMs: Math.max(0, Math.round(durationMs)),
    userId: typeof payload?.sub === 'number' ? payload.sub : null,
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
