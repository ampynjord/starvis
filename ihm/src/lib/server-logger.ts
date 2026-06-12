/**
 * Structured logger for Next.js server-side code (route handlers, RSC).
 * One JSON line per event so container log collectors can parse level/scope,
 * matching the structured logging already used by the Express API.
 */

type Level = 'info' | 'warn' | 'error';

function emit(level: Level, scope: string, message: string, error?: unknown): void {
  const entry: Record<string, unknown> = {
    level,
    scope,
    message,
    time: new Date().toISOString(),
  };
  if (error !== undefined) {
    entry.error = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error);
  }
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/** Log a server-side error with its scope (e.g. "admin/users GET"). */
export function logApiError(scope: string, error: unknown): void {
  emit('error', scope, 'Request handler failed', error);
}

export function logApiWarn(scope: string, message: string): void {
  emit('warn', scope, message);
}

export function logApiInfo(scope: string, message: string): void {
  emit('info', scope, message);
}
