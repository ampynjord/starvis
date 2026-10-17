export const SERVER_API_URL = (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
export const PUBLIC_SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://starvis.ampynjord.bzh').replace(/\/$/, '');
export const SERVER_API_KEY = process.env.SERVER_API_KEY ?? process.env.ADMIN_API_KEY ?? '';
