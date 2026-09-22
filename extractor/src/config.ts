import { EXTRACTOR_DEFAULTS } from './extractor-config.js';

export const RSI_BASE_URL = (process.env.RSI_BASE_URL ?? 'https://robertsspaceindustries.com').replace(/\/$/, '');
/**
 * Résout une adresse RSI, qu'elle arrive relative ou déjà absolue.
 *
 * La même décision était prise à huit endroits, de huit façons différentes. Le
 * seul appelant qui ne se gardait pas — le scraper CTM — a cassé le jour où la
 * synchronisation du Ship Matrix s'est mise à stocker l'URL absolue : il
 * fabriquait `robertsspaceindustries.comhttps//robertsspaceindustries.com/...`
 * et chaque vaisseau échouait sur un nom de domaine introuvable.
 *
 * Le scraper de galeries, lui, recevait la même valeur et la résolvait bien.
 * Une entrée, deux traitements, un cassé : c'est ce que cette fonction supprime.
 */
export function resolveRsiUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  // Adresse sans protocole (`//media.robertsspaceindustries.com/…`) : le jeu en
  // sert, et les coller à la base produirait une URL invalide.
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${RSI_BASE_URL}/${trimmed.replace(/^\/+/, '')}`;
}

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
