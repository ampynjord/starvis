export const DEFAULT_AUTH_COOKIE_NAME = 'starvis_token';
export const COOKIE_CONSENT_STORAGE_KEY = 'starvis_cookie_consent';
export const PUBLIC_RSI_URL = (process.env.NEXT_PUBLIC_RSI_URL ?? 'https://robertsspaceindustries.com').replace(/\/$/, '');

export const USER_ROLE = 'user';
export const DEVELOPER_ROLE = 'developer';
export const ADMIN_ROLE = 'admin';
export const USER_ROLES = [USER_ROLE, DEVELOPER_ROLE, ADMIN_ROLE] as const;
export const DEVELOPER_ACCESS_ROLES = [DEVELOPER_ROLE, ADMIN_ROLE] as const;

export function hasDeveloperAccess(role: string | undefined): boolean {
  return DEVELOPER_ACCESS_ROLES.includes(role as (typeof DEVELOPER_ACCESS_ROLES)[number]);
}

/** @deprecated use DEVELOPER_ROLE */
export const BETA_TESTER_ROLE = DEVELOPER_ROLE;
/** @deprecated use hasDeveloperAccess */
export const hasBetaAccess = hasDeveloperAccess;
