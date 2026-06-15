/**
 * Official ship gallery scraper.
 *
 * Uses the same RSI pledge pages as the CTM scraper, but captures official
 * image media from rendered DOM and network responses instead of 3D assets.
 */
import { chromium } from 'playwright';
import { RSI_BASE_URL, SHIP_GALLERY_INTER_SHIP_DELAY_MS, SHIP_GALLERY_RETRIES, SHIP_GALLERY_RETRY_BASE_DELAY_MS } from './config.js';
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
  fallbackImageUrl?: string | null;
}

export interface ShipGalleryScrapeOptions {
  concurrency?: number;
  interShipDelayMs?: number;
  retries?: number;
  retryBaseDelayMs?: number;
  onProgress?: (msg: string) => void;
}

const COOKIE_SELECTORS = [
  'button:text("Accept")',
  'button:text("Accepter")',
  'button:text-is("Accept All")',
  'button:text("I Agree")',
  'button:text("Agree")',
];

const MEDIA_URL_RE =
  /(?:https:\/\/media\.robertsspaceindustries\.com\/[a-z0-9]+\/[A-Za-z0-9_./()-]+\.(?:png|jpg|jpeg|webp)|\/i\/[a-f0-9]+\/[A-Za-z0-9_./(),-]+\.(?:png|jpg|jpeg|webp))/gi;
const GALLERY_VARIANTS = [
  'store_slideshow_large_zoom',
  'store_slideshow_large',
  'slideshow_wide',
  'slideshow',
  'wallpaper_3840x2160',
  'source',
];
const THUMB_VARIANTS = ['store_slideshow_small', 'slideshow_pager', 'product_thumb_large', 'store_small'];
const MIN_PRESENTABLE_GALLERY_WIDTH = 700;

export async function scrapeShipGalleryImages(
  ships: ShipGalleryToScrape[],
  opts: ShipGalleryScrapeOptions = {},
): Promise<Map<number, ShipGalleryImage[]>> {
  const { concurrency = 1, onProgress } = opts;
  const interShipDelayMs = Math.max(0, opts.interShipDelayMs ?? SHIP_GALLERY_INTER_SHIP_DELAY_MS);
  const retries = Math.max(0, opts.retries ?? SHIP_GALLERY_RETRIES);
  const retryBaseDelayMs = Math.max(0, opts.retryBaseDelayMs ?? SHIP_GALLERY_RETRY_BASE_DELAY_MS);
  const results = new Map<number, ShipGalleryImage[]>();
  const total = ships.length;

  for (let i = 0; i < total; i += Math.max(1, concurrency)) {
    const batch = ships.slice(i, i + Math.max(1, concurrency));
    const settled = await Promise.allSettled(
      batch.map((ship) =>
        scrapeOneGalleryPageWithRetry(ship, {
          retries,
          retryBaseDelayMs,
          onProgress,
        }),
      ),
    );
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
    if (i + batch.length < total && interShipDelayMs > 0) await sleep(interShipDelayMs);
  }

  return results;
}

async function scrapeOneGalleryPageWithRetry(
  ship: ShipGalleryToScrape,
  opts: Pick<ShipGalleryScrapeOptions, 'onProgress' | 'retries' | 'retryBaseDelayMs'>,
): Promise<ShipGalleryImage[]> {
  const retries = opts.retries ?? SHIP_GALLERY_RETRIES;
  const retryBaseDelayMs = opts.retryBaseDelayMs ?? SHIP_GALLERY_RETRY_BASE_DELAY_MS;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await scrapeOneGalleryPage(ship);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt >= retries) break;

      const delay = retryBaseDelayMs * (attempt + 1);
      opts.onProgress?.(
        `Gallery retry ${attempt + 1}/${retries} for ${ship.name} after network error: ${lastError.message}. Waiting ${Math.round(delay / 1000)}s`,
      );
      await sleep(delay);
    }
  }

  throw lastError ?? new Error(`Unknown gallery scraping error for ${ship.name}`);
}

async function scrapeOneGalleryPage(ship: ShipGalleryToScrape): Promise<ShipGalleryImage[]> {
  const fullUrl = normalizePageUrl(ship.rsiUrl);
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
      if (url.includes('media.robertsspaceindustries.com')) collectImageUrl(url, candidates);
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

    const pledgeUrls = (await page.evaluate(() => {
      const values = new Set<string>();
      const doc = (globalThis as any).document;
      doc
        .querySelectorAll('.orion-c-slideShow img, .orion-c-slideShow source, [class*="slideShow"] img, [class*="slideShow"] source')
        .forEach((el: any) => {
          if (el.tagName === 'IMG' && el.currentSrc) values.add(el.currentSrc);
          for (const attr of ['src', 'srcset', 'data-src', 'data-srcset']) {
            const value = el.getAttribute(attr);
            if (!value) continue;
            value.split(',').forEach((part: string) => {
              values.add(part.trim().split(/\s+/)[0]);
            });
          }
        });
      return [...values];
    })) as string[];
    for (const url of pledgeUrls) {
      collectImageUrl(url, candidates, {
        kind: 'pledge-gallery',
        raw: { source: 'pledge_store_carousel' },
      });
    }
  } finally {
    await browser.close();
  }

  if (ship.fallbackImageUrl) {
    collectImageUrl(ship.fallbackImageUrl, candidates, {
      title: ship.name,
      kind: candidates.size === 0 ? 'ship-matrix-media' : 'rsi-media',
      raw: { source: 'ship_matrix', fallback: candidates.size === 0 },
    });
  }

  return [...candidates.values()].map((image, index) => ({ ...image, position: index })).slice(0, 80);
}

function normalizePageUrl(url: string): string {
  if (url.startsWith('http')) return url;
  return `${RSI_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
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
    if (url && !url.includes('/i/')) {
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
  for (const url of matches) {
    if (url.includes('/i/')) continue;
    collectImageUrl(url, out);
  }
}

function collectImageUrl(url: string, out: Map<string, ShipGalleryImage>, meta?: Partial<ShipGalleryImage>): void {
  const normalized = normalizeMediaUrl(url);
  if (!normalized || !isImageCandidate(normalized)) return;
  const mediaKey = getMediaKey(normalized);
  const existing = out.get(mediaKey);
  const normalizedThumb = meta?.thumbnailUrl ? normalizeMediaUrl(meta.thumbnailUrl) : null;
  const thumbnailUrl =
    normalizedThumb && isImageCandidate(normalizedThumb) ? thumbnailFromUrl(normalizedThumb) : thumbnailFromUrl(normalized);

  if (!isPresentableGalleryImage(normalized)) {
    if (existing && !existing.thumbnailUrl) {
      existing.thumbnailUrl = thumbnailUrl ?? normalized;
    }
    return;
  }

  const score = galleryScore(normalized);
  if (existing && galleryScore(existing.url) >= score) {
    if (!existing.thumbnailUrl && thumbnailUrl) existing.thumbnailUrl = thumbnailUrl;
    return;
  }
  out.set(mediaKey, {
    url: normalized,
    thumbnailUrl,
    title: meta?.title ?? null,
    kind: meta?.kind ?? inferImageKind(normalized),
    position: out.size,
    raw: meta?.raw ?? null,
  });
}

function inferImageKind(url: string): string {
  if (url.includes('media.robertsspaceindustries.com')) return 'rsi-media';
  if (url.includes('robertsspaceindustries.com/i/')) return 'pledge-gallery';
  return 'official-gallery';
}

function normalizeMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const clean = url.replace(/&amp;/g, '&').trim();
  if (clean.startsWith('//')) return `https:${clean}`;
  if (clean.startsWith('/')) return `${RSI_BASE_URL}${clean}`;
  return clean.startsWith('http') ? clean : null;
}

function getMediaKey(url: string): string {
  return (
    url.match(/media\.robertsspaceindustries\.com\/([a-z0-9]+)\//i)?.[1] ??
    url.match(/resize\([^)]*,([A-Za-z0-9]+)\)\/(?:source|[^/]+)\.webp/i)?.[1] ??
    url.match(/robertsspaceindustries\.com\/i\/([a-f0-9]+)\//i)?.[1] ??
    url
  );
}

function firstImageVariant(images: Record<string, unknown>, variants: string[]): string | null {
  for (const variant of variants) {
    const value = images[variant];
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

function isImageCandidate(url: string): boolean {
  const lower = url.toLowerCase();
  if (!/\.(?:webp|png|jpe?g)(?:[?#].*)?$/.test(lower)) return false;
  if (
    lower.startsWith('data:') ||
    lower.includes('empty-ship') ||
    lower.includes('manufacturer_logo') ||
    lower.includes('/avatar.') ||
    lower.includes('/icon.') ||
    lower.includes('/logo.')
  ) {
    return false;
  }

  if (lower.includes('media.robertsspaceindustries.com')) {
    return GALLERY_VARIANTS.some((variant) => lower.includes(`/${variant}.`)) || lower.includes('/store_slideshow_');
  }

  return lower.includes('robertsspaceindustries.com/i/');
}

function isPresentableGalleryImage(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes('media.robertsspaceindustries.com')) {
    return GALLERY_VARIANTS.some((variant) => lower.includes(`/${variant}.`)) || lower.includes('/store_slideshow_');
  }

  if (lower.includes('robertsspaceindustries.com/i/')) {
    const width = getResizeWidth(lower);
    return width === null || width >= MIN_PRESENTABLE_GALLERY_WIDTH;
  }

  return false;
}

function galleryScore(url: string): number {
  const lower = url.toLowerCase();
  const index = GALLERY_VARIANTS.findIndex((variant) => lower.includes(`/${variant}.`));
  if (index !== -1) return GALLERY_VARIANTS.length - index;
  const width = getResizeWidth(lower) ?? 0;
  return width > 0 ? width / 100 : 0;
}

function getResizeWidth(url: string): number | null {
  const match = url.match(/resize\((\d+),/);
  if (!match) return null;
  const width = Number.parseInt(match[1], 10);
  return Number.isFinite(width) ? width : null;
}

function thumbnailFromUrl(url: string): string | null {
  if (url.includes('robertsspaceindustries.com/i/')) {
    return url.replace(/\/source\.webp$/, '/store_slideshow_small.webp');
  }
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
