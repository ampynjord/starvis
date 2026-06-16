import { EXTRACTOR_DEFAULTS } from './extractor-config.js';

export const RSI_BASE_URL = (process.env.RSI_BASE_URL ?? 'https://robertsspaceindustries.com').replace(/\/$/, '');
export const SC_WIKI_API_URL = (process.env.SC_WIKI_API_URL ?? 'https://api.star-citizen.wiki/api').replace(/\/$/, '');
export const RSI_SHIP_MATRIX_URL = process.env.RSI_SHIP_MATRIX_URL ?? `${RSI_BASE_URL}/ship-matrix/index`;
export const CTM_WAIT_MS = parseInt(process.env.CTM_WAIT_MS ?? '15000', 10);
export const CTM_INTER_SHIP_DELAY_MS = parseInt(process.env.CTM_INTER_SHIP_DELAY_MS ?? '1500', 10);
export const SHIP_GALLERY_INTER_SHIP_DELAY_MS = parseInt(
  process.env.SHIP_GALLERY_INTER_SHIP_DELAY_MS ?? String(EXTRACTOR_DEFAULTS.galleryDelayMs),
  10,
);
export const SHIP_GALLERY_RETRIES = parseInt(process.env.SHIP_GALLERY_RETRIES ?? String(EXTRACTOR_DEFAULTS.galleryRetries), 10);
export const SHIP_GALLERY_RETRY_BASE_DELAY_MS = parseInt(
  process.env.SHIP_GALLERY_RETRY_BASE_DELAY_MS ?? String(EXTRACTOR_DEFAULTS.galleryRetryDelayMs),
  10,
);
export const SCRAPER_USER_AGENT = process.env.SCRAPER_USER_AGENT ?? 'Starvis-Scraper/1.0';
