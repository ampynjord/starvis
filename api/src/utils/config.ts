/**
 * Configuration centralisée — toutes les valeurs viennent du .env
 */

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const DB_CONFIG = {
  host: requireEnv('DB_HOST'),
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: requireEnv('DB_USER'),
  password: requireEnv('DB_PASSWORD'),
  database: requireEnv('DB_NAME'),
  waitForConnections: true,
  connectionLimit: 10,
};

/** Allowed game environment database names. */
const GAME_DB_NAMES: Record<string, string> = { live: 'live', ptu: 'ptu' };

/** All database names managed by the application. */
export const ALL_DB_NAMES = ['starvis', 'live', 'ptu'] as const;

/**
 * Resolve a game environment string to a safe database name.
 * Throws if the env is unknown (prevents SQL injection via qualified table names).
 */
export function gameDb(env: string): string {
  const db = GAME_DB_NAMES[env];
  if (!db) throw new Error(`Unknown game env "${env}". Allowed: ${Object.keys(GAME_DB_NAMES).join(', ')}`);
  return db;
}

/** Build a mysql:// URL suited for Prisma from individual DB env vars. */
export function buildDatabaseUrl(dbName?: string): string {
  const user = encodeURIComponent(requireEnv('DB_USER'));
  const pass = encodeURIComponent(requireEnv('DB_PASSWORD'));
  const host = requireEnv('DB_HOST');
  const port = process.env.DB_PORT || '3306';
  const name = dbName ?? requireEnv('DB_NAME');
  return `mysql://${user}:${pass}@${host}:${port}/${name}`;
}

export const RATE_LIMITS = {
  // Shared window for all limiters
  windowMs: 15 * 60 * 1000,
  // Hard limit: requests per window per IP (then 429)
  max: parseInt(process.env.RATE_LIMIT_MAX || '200', 10),
  // Strict limit for admin endpoints
  adminMax: 20,
  // Burst: max requests per minute per IP
  burstWindowMs: 60 * 1000,
  burst: parseInt(process.env.RATE_LIMIT_BURST || '60', 10),
  // Slow-down: start adding delay after this many requests
  slowAfter: 100,
};
