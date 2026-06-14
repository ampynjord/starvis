export const SITE_URL = (process.env.SITE_URL ?? 'https://starvis.ampynjord.bzh').replace(/\/$/, '');
export const API_BASE_URL = (process.env.API_URL ?? 'http://api:3000').replace(/\/$/, '');
export const API_TIMEOUT_MS = parseInt(process.env.API_TIMEOUT_MS ?? '10000', 10);
export const API_TOKEN = process.env.API_TOKEN ?? '';
export const DISCORD_DEFAULT_MEMBER_ROLE_ID = process.env.DISCORD_DEFAULT_MEMBER_ROLE_ID?.trim() ?? '';
export const DISCORD_DEFAULT_MEMBER_ROLE_NAME = (process.env.DISCORD_DEFAULT_MEMBER_ROLE_NAME ?? 'Member').trim();
