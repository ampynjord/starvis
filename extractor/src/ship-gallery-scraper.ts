/**
 * Official ship gallery scraper.
 *
 * Uses the same RSI pledge pages as the CTM scraper, but captures official
 * image media from rendered DOM and network responses instead of 3D assets.
 */
import { chromium } from 'playwright';
import { CTM_INTER_SHIP_DELAY_MS, RSI_BASE_URL } from './config.js';
import type { ShipToScrape } from './ctm-scraper.js';

export interface ShipGalleryImage {
  url: string;
  thumbnailUrl: string | null;
  title: string | null;
  kind: string;
  position: number;
  raw: Record<string, unknown> | null;
}

export interface ShipGalleryToScrape extends ShipToScrape {
  shipMatrixId: number;
}

export interface ShipGalleryScrapeOptions {
  concurrency?: number;
  onProgress?: (msg: string) => void;
}

const COOKIE_SELECTORS = [
  'button:text("Accept")',
  'button:text("Accepter")',
  'button:text-is("Accept All")',
  'button:text("I Agree")',
  'button:text("Agree")',
];

const MEDIA_URL_RE = /https:\/\/media\.robertsspaceindustries\.com\/[a-z0-9]+\/[A-Za-z0-9_./-]+\.(?:png|jpg|jpeg|webp)/gi;
const GALLERY_VARIANTS = [
  'store_slideshow_large_zoom',
  'store_slideshow_large',
  'slideshow_wide',
  'slideshow',
  'wallpaper_3840x2160',
  'source',
];
const THUMB_VARIANTS = ['store_slideshow_small', 'slideshow_pager', 'product_thumb_large', 'store_small'];

export async function scrapeShipGalleryImages(
  ships: ShipGalleryToScrape[],
  opts: ShipGalleryScrapeOptions = {},
): Promise<Map<number, ShipGalleryImage[]>> {
  const { concurrency = 1, onProgress } = opts;
  const results = new Map<number, ShipGalleryImage[]>();
  const total = ships.length;

  for (let i = 0; i < total; i += Math.max(1, concurrency)) {
    const batch = ships.slice(i, i + Math.max(1, concurrency));
    const settled = await Promise.allSettled(batch.map((ship) => scrapeOneGalleryPage(ship)));
    settled.forEach((result, index) => {
      const ship = batch[index];
      const done = Math.min(i + index + 1, total);
      if (result.status === 'fulfilled') {
        results.set(ship.shipMatrixId, result.value);
        onProgress?.(`[${done}/${total}] Gallery: ${ship.name} (${result.value.length} image${result.value.length !== 1 ? 's' : ''})`);
      } else {
        onProgress?.(`[${done}/${total}] Gallery error for ${ship.name}: ${(result.reason as Error).message}`);
      }
    });
    if (i + batch.length < total) await sleep(CTM_INTER_SHIP_DELAY_MS);
  }

  return results;
}

async function scrapeOneGalleryPage(ship: ShipGalleryToScrape): Promise<ShipGalleryImage[]> {
  const fullUrl = `${RSI_BASE_URL}${ship.rsiUrl}`;
  const candidates = new Map<string, ShipGalleryImage>();

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 1200 },
    });
    const page = await context.newPage();

    page.on('response', async (response) => {
      const url = response.url();
      if (!looksRelevantResponse(url)) return;
      try {
        const contentType = response.headers()['content-type'] ?? '';
        if (contentType.includes('application/json')) {
          collectFromUnknown(await response.json(), candidates);
        } else if (contentType.includes('text/') || url.includes('pledge-store')) {
          collectFromText(await response.text(), candidates);
        }
      } catch {
        // Ignore streaming, binary or blocked responses.
      }
    });

    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await sleep(1_500);
    for (const selector of COOKIE_SELECTORS) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 1_000 })) {
          await btn.click();
          break;
        }
      } catch {}
    }

    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
    await page.evaluate(`(async () => {
      for (let y = 0; y <= document.body.scrollHeight; y += 900) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    })()`);
    await sleep(2_000);

    const domUrls = (await page.evaluate(`(() => {
      const values = new Set();
      document.querySelectorAll('img, source').forEach((el) => {
        for (const attr of ['src', 'srcset', 'data-src', 'data-srcset']) {
          const value = el.getAttribute(attr);
          if (!value) continue;
          value.split(',').forEach((part) => values.add(part.trim().split(/s+/)[0]));
        }
      });
      return [...values];
    })()`)) as string[];
    for (const url of domUrls) collectImageUrl(url, candidates);
  } finally {
    await browser.close();
  }

  return [...candidates.values()].map((image, index) => ({ ...image, position: index })).slice(0, 80);
}

function looksRelevantResponse(url: string): boolean {
  return url.includes('robertsspaceindustries.com') || url.includes('media.robertsspaceindustries.com') || url.includes('pledge-store');
}

function collectFromUnknown(value: unknown, out: Map<string, ShipGalleryImage>): void {
  if (!value) return;
  if (typeof value === 'string') {
    collectFromText(value, out);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectFromUnknown(item, out);
    return;
  }
  if (typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  const images = record.images;
  if (images && typeof images === 'object') {
    const imageRecord = images as Record<string, unknown>;
    const url = firstImageVariant(imageRecord, GALLERY_VARIANTS);
    if (url) {
      const thumbnailUrl = firstImageVariant(imageRecord, THUMB_VARIANTS);
      collectImageUrl(url, out, {
        thumbnailUrl,
        title: stringOrNull(record.title ?? record.name ?? record.source_name),
        kind: 'official-gallery',
        raw: record,
      });
    }
  }

  for (const nested of Object.values(record)) collectFromUnknown(nested, out);
}

function collectFromText(text: string, out: Map<string, ShipGalleryImage>): void {
  const matches = text.match(MEDIA_URL_RE) ?? [];
  for (const url of matches) collectImageUrl(url, out);
}

function collectImageUrl(url: string, out: Map<string, ShipGalleryImage>, meta?: Partial<ShipGalleryImage>): void {
  const normalized = normalizeMediaUrl(url);
  if (!normalized || !isGalleryCandidate(normalized)) return;
  const mediaKey = normalized.match(/media\.robertsspaceindustries\.com\/([a-z0-9]+)\//i)?.[1] ?? normalized;
  const existing = out.get(mediaKey);
  const score = galleryScore(normalized);
  if (existing && galleryScore(existing.url) >= score) return;
  out.set(mediaKey, {
    url: normalized,
    thumbnailUrl: meta?.thumbnailUrl ? normalizeMediaUrl(meta.thumbnailUrl) : thumbnailFromUrl(normalized),
    title: meta?.title ?? null,
    kind: meta?.kind ?? 'official-gallery',
    position: out.size,
    raw: meta?.raw ?? null,
  });
}

function normalizeMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const clean = url.replace(/&amp;/g, '&').trim();
  if (clean.startsWith('//')) return `https:${clean}`;
  if (clean.startsWith('/')) return `${RSI_BASE_URL}${clean}`;
  return clean.startsWith('http') ? clean : null;
}

function firstImageVariant(images: Record<string, unknown>, variants: string[]): string | null {
  for (const variant of variants) {
    const value = images[variant];
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

function isGalleryCandidate(url: string): boolean {
  if (!url.includes('media.robertsspaceindustries.com')) return false;
  const lower = url.toLowerCase();
  if (lower.includes('manufacturer_logo') || lower.includes('/avatar.') || lower.includes('/icon.') || lower.includes('/logo.'))
    return false;
  return GALLERY_VARIANTS.some((variant) => lower.includes(`/${variant}.`)) || lower.includes('/store_slideshow_');
}

function galleryScore(url: string): number {
  const lower = url.toLowerCase();
  const index = GALLERY_VARIANTS.findIndex((variant) => lower.includes(`/${variant}.`));
  return index === -1 ? 0 : GALLERY_VARIANTS.length - index;
}

function thumbnailFromUrl(url: string): string | null {
  return url.replace(
    /\/(?:store_slideshow_large_zoom|store_slideshow_large|slideshow_wide|wallpaper_3840x2160|source)\./,
    '/store_slideshow_small.',
  );
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
