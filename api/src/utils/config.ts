/**
 * Centralized configuration — all values come from .env
 */
import type { SignOptions } from 'jsonwebtoken';

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
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || process.env.DB_EXTERNAL_PORT || '5432';
  const name = process.env.DB_NAME || requireEnv('DB_NAME');
  return `postgresql://${user}:${pass}@${host}:${port}/${name}`;
}

export const RATE_LIMITS = {
  // Shared window for all limiters
  windowMs: 15 * 60 * 1000,
  // Hard limit: requests per window per IP (then 429)
  max: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10),
  // Admin screens poll several supervision endpoints; keep this protective but
  // high enough for normal dashboard usage.
  adminMax: parseInt(process.env.RATE_LIMIT_ADMIN_MAX || '1000', 10),
  // Anonymous /api/v1 callers (no API token): requests per window per IP
  anonymousMax: parseInt(process.env.RATE_LIMIT_ANONYMOUS_MAX || '300', 10),
  // AI assistant questions per window per website visitor
  chatMax: parseInt(process.env.RATE_LIMIT_CHAT_MAX || '30', 10),
  // Burst: max requests per minute per IP
  burstWindowMs: 60 * 1000,
  burst: parseInt(process.env.RATE_LIMIT_BURST || '240', 10),
  // Slow-down: start adding delay after this many requests
  slowAfter: 100,
};

/**
 * Directory where CTM model files are cached on disk.
 * Cache key: {uuid}.ctm + {uuid}.url (sidecar containing the source URL)
 * When ctm_url changes in DB, the sidecar mismatch triggers a re-fetch.
 */
export const CTM_CACHE_DIR = process.env.CTM_CACHE_DIR ?? '/tmp/ctm-cache';

export const JWT_API_TOKEN_EXPIRES = (process.env.JWT_API_TOKEN_EXPIRES ?? '1y') as SignOptions['expiresIn'];

export const CHAT_TOOL_MODEL = process.env.CHAT_TOOL_MODEL ?? 'mistral-small-latest';
export const CHAT_RESPONSE_MODEL = process.env.CHAT_RESPONSE_MODEL ?? 'mistral-large-latest';
export const CHAT_MAX_ITER = parseInt(process.env.CHAT_MAX_ITER ?? '3', 10);
export const CHAT_PROVIDER_BASE_URL = process.env.CHAT_PROVIDER_BASE_URL ?? 'https://api.mistral.ai/v1';
