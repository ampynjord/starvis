export const DEFAULT_AUTH_COOKIE_NAME = 'starvis_token';
export const COOKIE_CONSENT_STORAGE_KEY = 'starvis_cookie_consent';
export const PUBLIC_RSI_URL = (process.env.NEXT_PUBLIC_RSI_URL ?? 'https://robertsspaceindustries.com').replace(/\/$/, '');

export const USER_ROLE = 'user';
export const BETA_TESTER_ROLE = 'beta_tester';
export const ADMIN_ROLE = 'admin';
export const USER_ROLES = [USER_ROLE, BETA_TESTER_ROLE, ADMIN_ROLE] as const;
export const BETA_ACCESS_ROLES = [BETA_TESTER_ROLE, ADMIN_ROLE] as const;

export function hasBetaAccess(role: string | undefined): boolean {
  return BETA_ACCESS_ROLES.includes(role as (typeof BETA_ACCESS_ROLES)[number]);
}
