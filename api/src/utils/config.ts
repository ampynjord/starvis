/**
 * Centralized configuration — all values come from .env
 */

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

/** Build a postgresql:// URL suited for Prisma from individual DB env vars. */
export function buildDatabaseUrl(): string {
  // If DATABASE_URL is set directly, use it (Docker / production)
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const user = encodeURIComponent(requireEnv('DB_USER'));
  const pass = encodeURIComponent(requireEnv('DB_PASSWORD'));
  const host = requireEnv('DB_HOST');
  const port = process.env.DB_PORT || '5432';
  const name = process.env.DB_NAME || requireEnv('DB_NAME');
  return `postgresql://${user}:${pass}@${host}:${port}/${name}`;
}

export const RATE_LIMITS = {
  // Shared window for all limiters
  windowMs: 15 * 60 * 1000,
  // Hard limit: requests per window per IP (then 429)
  max: parseInt(process.env.RATE_LIMIT_MAX || '200', 10),
  // Strict limit for admin endpoints
  adminMax: parseInt(process.env.RATE_LIMIT_ADMIN_MAX || '20', 10),
  // Burst: max requests per minute per IP
  burstWindowMs: 60 * 1000,
  burst: parseInt(process.env.RATE_LIMIT_BURST || '60', 10),
  // Slow-down: start adding delay after this many requests
  slowAfter: 100,
};

/**
 * Directory where CTM model files are cached on disk.
 * Cache key: {uuid}.ctm + {uuid}.url (sidecar containing the source URL)
 * When ctm_url changes in DB, the sidecar mismatch triggers a re-fetch.
 */
export const CTM_CACHE_DIR = process.env.CTM_CACHE_DIR ?? '/tmp/ctm-cache';
