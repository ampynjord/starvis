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
  // Strict limit for admin endpoints
  adminMax: parseInt(process.env.RATE_LIMIT_ADMIN_MAX || '100', 10),
  // Strict limit for failed authentication attempts (login, reset, 2FA)
  authMax: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '10', 10),
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

export const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? 'starvis_token';

export const USER_ROLE = 'user';
export const DEVELOPER_ROLE = 'developer';
export const ADMIN_ROLE = 'admin';
export const USER_ROLES = [USER_ROLE, DEVELOPER_ROLE, ADMIN_ROLE] as const;
export const DEVELOPER_ACCESS_ROLES = [DEVELOPER_ROLE, ADMIN_ROLE] as const;

/** @deprecated use DEVELOPER_ROLE */
export const BETA_TESTER_ROLE = DEVELOPER_ROLE;
/** @deprecated use DEVELOPER_ACCESS_ROLES */
export const BETA_ACCESS_ROLES = DEVELOPER_ACCESS_ROLES;

export const JWT_EXPIRES = (process.env.JWT_EXPIRES ?? '7d') as SignOptions['expiresIn'];
export const JWT_API_TOKEN_EXPIRES = (process.env.JWT_API_TOKEN_EXPIRES ?? '1y') as SignOptions['expiresIn'];
export const JWT_2FA_PENDING_EXPIRES = (process.env.JWT_2FA_PENDING_EXPIRES ?? '5m') as SignOptions['expiresIn'];
export const RESET_TOKEN_TTL_MS = parseInt(process.env.RESET_TOKEN_TTL_MS ?? String(60 * 60 * 1000), 10);

export const CHAT_TOOL_MODEL = process.env.CHAT_TOOL_MODEL ?? 'mistral-small-latest';
export const CHAT_RESPONSE_MODEL = process.env.CHAT_RESPONSE_MODEL ?? 'mistral-large-latest';
export const CHAT_MAX_ITER = parseInt(process.env.CHAT_MAX_ITER ?? '3', 10);
export const CHAT_PROVIDER_BASE_URL = process.env.CHAT_PROVIDER_BASE_URL ?? 'https://api.mistral.ai/v1';
