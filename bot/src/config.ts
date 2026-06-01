export const SITE_URL = (process.env.SITE_URL ?? 'https://starvis.ampynjord.bzh').replace(/\/$/, '');
export const API_BASE_URL = (process.env.API_URL ?? 'http://api:3000').replace(/\/$/, '');
export const API_TIMEOUT_MS = parseInt(process.env.API_TIMEOUT_MS ?? '10000', 10);
