/**
 * Logger for the extractor CLI.
 *
 * Default text output stays human-readable, while JSON mode is stable for CI,
 * cron jobs, and log collectors.
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 } as const;

export type LogLevel = keyof typeof LEVELS;
export type LogFormat = 'text' | 'json';

export interface LoggerOptions {
  level?: LogLevel;
  format?: LogFormat;
  color?: boolean;
  quiet?: boolean;
  context?: Record<string, unknown>;
}

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  success(msg: string, meta?: Record<string, unknown>): void;
  step(msg: string, meta?: Record<string, unknown>): void;
  fail(msg: string, meta?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
  withTimer<T>(label: string, fn: () => Promise<T>, meta?: Record<string, unknown>): Promise<T>;
}

let activeOptions: Required<Omit<LoggerOptions, 'context'>> = {
  level: normalizeLogLevel(process.env.LOG_LEVEL) ?? 'info',
  format: 'text',
  color: process.stdout.isTTY,
  quiet: false,
};

function normalizeLogLevel(value: unknown): LogLevel | undefined {
  return typeof value === 'string' && value in LEVELS ? (value as LogLevel) : undefined;
}

export function configureLogger(options: LoggerOptions): void {
  const normalizedLevel = normalizeLogLevel(options.level);
  activeOptions = {
    ...activeOptions,
    ...options,
    level: options.quiet ? 'silent' : (normalizedLevel ?? activeOptions.level),
    format: options.format ?? activeOptions.format,
    color: options.color ?? activeOptions.color,
    quiet: options.quiet ?? activeOptions.quiet,
  };
}

function colorize(level: Exclude<LogLevel, 'silent'>, text: string): string {
  if (!activeOptions.color || activeOptions.format === 'json') return text;
  const colors: Record<Exclude<LogLevel, 'silent'>, string> = {
    debug: '\x1b[90m',
    info: '\x1b[36m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
  };
  return `${colors[level]}${text}\x1b[0m`;
}

function sanitizeMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (/password|token|secret|key/i.test(key)) {
      result[key] = '[redacted]';
    } else {
      result[key] = value;
    }
  }
  return result;
}

function createLogger(context: Record<string, unknown> = {}): Logger {
  function write(level: Exclude<LogLevel, 'silent'>, msg: string, meta?: Record<string, unknown>) {
    if (LEVELS[level] < LEVELS[activeOptions.level]) return;

    const mergedMeta = sanitizeMeta({ ...context, ...meta });
    const ts = new Date().toISOString();
    const output =
      activeOptions.format === 'json'
        ? JSON.stringify({ ts, level, msg, ...mergedMeta })
        : `${colorize(level, `[${ts}] [${level.toUpperCase()}]`)} ${msg}${mergedMeta && Object.keys(mergedMeta).length ? ` ${JSON.stringify(mergedMeta)}` : ''}`;

    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(output);
  }

  const logger: Logger = {
    debug: (msg, meta) => write('debug', msg, meta),
    info: (msg, meta) => write('info', msg, meta),
    warn: (msg, meta) => write('warn', msg, meta),
    error: (msg, meta) => write('error', msg, meta),
    success: (msg, meta) => write('info', `OK ${msg}`, meta),
    step: (msg, meta) => write('info', `-- ${msg}`, meta),
    fail: (msg, meta) => write('error', `FAIL ${msg}`, meta),
    child: (childContext) => createLogger({ ...context, ...childContext }),
    withTimer: async (label, fn, meta) => {
      const start = Date.now();
      logger.step(label, meta);
      try {
        const result = await fn();
        logger.success(label, { ...meta, durationMs: Date.now() - start });
        return result;
      } catch (error) {
        logger.fail(label, { ...meta, durationMs: Date.now() - start, error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    },
  };

  return logger;
}

const logger = createLogger();

export default logger;
