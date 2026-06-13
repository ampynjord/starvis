import { DEFAULT_AUTH_COOKIE_NAME } from './app-constants';

export const SERVER_API_URL = (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
export const PUBLIC_SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://starvis.ampynjord.bzh').replace(/\/$/, '');
export const SERVER_API_KEY = process.env.ADMIN_API_KEY ?? '';

export const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? DEFAULT_AUTH_COOKIE_NAME;

export const SESSION_COOKIE_MAX_AGE_SECONDS = Number(process.env.SESSION_COOKIE_MAX_AGE_SECONDS ?? 7 * 24 * 60 * 60);
