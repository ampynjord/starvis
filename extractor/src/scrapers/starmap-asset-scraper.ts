/**
 * StarmapAssetScraper — Playwright-based scraper for ARK Starmap 3D assets.
 *
 * Navigates each star system on the RSI ARK Starmap, intercepts all network
 * responses, and captures texture/model asset URLs used by the WebGL renderer.
 *
 * Asset categories captured:
 *   - textures: .png .jpg .webp .dds .ktx .ktx2 .basis .exr .hdr
 *   - models:   .glb .gltf .obj .bin .ctm .dae
 *   - skybox:   equirectangular or cubemap textures (by URL heuristic)
 *
 * Requires headful Chromium (same as CTM scraper) because WebGL is often
 * disabled in headless mode.
 */

import { chromium, type Page } from 'playwright';
import { RSI_BASE_URL } from '../config.js';
import logger from '../logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StarmapSystem {
  code: string;
  name: string;
  rsiId: string;
}

export interface StarmapBodyRef {
  rsiId: string;
  name: string;
  type: string;
}

export interface ScrapedAssets {
  textures: string[];
  models: string[];
  skybox: string[];
  raw: string[];
}

export interface StarmapAssetScrapeResult {
  systemCode: string;
  assets: ScrapedAssets;
}

export interface AssetScrapeOptions {
  concurrency?: number;
  waitMs?: number;
  onProgress?: (msg: string) => void;
}

// ── URL matchers ───────────────────────────────────────────────────────────────

const TEXTURE_EXTS = /\.(png|jpg|jpeg|webp|dds|ktx|ktx2|basis|exr|hdr)(\?|$)/i;
const MODEL_EXTS = /\.(glb|gltf|obj|bin|ctm|fbx|dae)(\?|$)/i;
const SKYBOX_HINTS = /sky(?:box)?|nebula|background|spacecube|environ|hdri|ibl/i;

// RSI CDN domains that host 3D assets
const RSI_ASSET_DOMAINS = [
  'media.robertsspaceindustries.com',
  'robertsspaceindustries.com',
  'cdn.robertsspaceindustries.com',
  'assets.robertsspaceindustries.com',
  'static.robertsspaceindustries.com',
];
const RSI_CDN_BASE_URL = 'https://cdn.robertsspaceindustries.com';

function isRsiAssetUrl(url: string): boolean {
  return RSI_ASSET_DOMAINS.some((d) => url.includes(d));
}

function categorizeUrl(url: string): 'texture' | 'model' | 'skybox' | null {
  if (!isRsiAssetUrl(url)) return null;
  if (MODEL_EXTS.test(url)) return 'model';
  if (TEXTURE_EXTS.test(url)) {
    const path = new URL(url).pathname;
    return SKYBOX_HINTS.test(path) ? 'skybox' : 'texture';
  }
  return null;
}

export function emptyScrapedAssets(): ScrapedAssets {
  return { textures: [], models: [], skybox: [], raw: [] };
}

export function assetCount(assets: ScrapedAssets): number {
  return assets.textures.length + assets.models.length + assets.skybox.length;
}

export function addAsset(assets: ScrapedAssets, url: string): void {
  const cat = categorizeUrl(url);
  if (!cat) return;
  if (!assets.raw.includes(url)) assets.raw.push(url);
  const bucket = cat === 'model' ? assets.models : cat === 'skybox' ? assets.skybox : assets.textures;
  if (!bucket.includes(url)) bucket.push(url);
}

export function mergeAssets(target: ScrapedAssets, source: ScrapedAssets): void {
  for (const url of source.raw) addAsset(target, url);
  for (const url of source.textures) addAsset(target, url);
  for (const url of source.models) addAsset(target, url);
  for (const url of source.skybox) addAsset(target, url);
}

function addMediaObjectAssets(assets: ScrapedAssets, value: unknown): void {
  if (!value || typeof value !== 'object') return;
  const media = value as { source?: unknown; url?: unknown; images?: Record<string, unknown> };
  if (typeof media.source === 'string') addAsset(assets, media.source);
  if (typeof media.url === 'string') addAsset(assets, media.url);
  if (media.images && typeof media.images === 'object') {
    for (const imageUrl of Object.values(media.images)) {
      if (typeof imageUrl === 'string') addAsset(assets, imageUrl);
    }
  }
}

function addSunTextureAsset(assets: ScrapedAssets, value: unknown): void {
  const raw = typeof value === 'number' || typeof value === 'string' ? String(value) : '';
  const index = Number.parseInt(raw, 10);
  if (!Number.isFinite(index) || index < 1 || index > 99) return;
  addAsset(assets, `${RSI_CDN_BASE_URL}/static/starmap/sourceimages/suns/${String(index).padStart(2, '0')}_Texture.jpg`);
}

function starmapSunShader(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const shaderData = value as Record<string, unknown>;
  return shaderData.sun && typeof shaderData.sun === 'object' ? (shaderData.sun as Record<string, unknown>) : null;
}

function collectPublicAssetUrls(assets: ScrapedAssets, value: unknown, depth = 0): void {
  if (depth > 8 || value == null) return;
  if (typeof value === 'string') {
    addAsset(assets, value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPublicAssetUrls(assets, item, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  addMediaObjectAssets(assets, record.texture);
  addMediaObjectAssets(assets, record.thumbnail);
  addMediaObjectAssets(assets, record.media);
  const sun = starmapSunShader(record.shader_data);
  addSunTextureAsset(assets, sun?.map);
  addSunTextureAsset(assets, sun?.texture);

  for (const [key, child] of Object.entries(record)) {
    if (key === 'info_url' || key === 'web_url' || key === 'description') continue;
    collectPublicAssetUrls(assets, child, depth + 1);
  }
}

export function extractPublicAssetsFromStarmapObject(value: unknown): ScrapedAssets {
  const assets = emptyScrapedAssets();
  collectPublicAssetUrls(assets, value);
  return assets;
}

let staticBundleAssetsCache: Promise<ScrapedAssets> | null = null;

async function scrapeStaticBundleAssets(): Promise<ScrapedAssets> {
  staticBundleAssetsCache ??= (async () => {
    const bundleUrl = `${RSI_CDN_BASE_URL}/static/starmap/starmap.bundle.js`;
    const response = await fetch(bundleUrl);
    if (!response.ok) throw new Error(`ARK bundle fetch failed: ${response.status}`);
    const bundle = await response.text();
    const resourcePath = bundle.match(/resourcePath:"([^"]+)"/)?.[1] ?? `${RSI_CDN_BASE_URL}/static/starmap`;
    const assets = emptyScrapedAssets();
    const pathPattern =
      /(?:["']|\/)([A-Za-z0-9_./-]+\.(?:png|jpg|jpeg|webp|dds|ktx|ktx2|basis|exr|hdr|glb|gltf|obj|bin|ctm|fbx|dae))(?:["']|\b)/gi;
    const seen = new Set<string>();
    for (const match of bundle.matchAll(pathPattern)) {
      const rawPath = match[1];
      if (!rawPath || seen.has(rawPath)) continue;
      if (!rawPath.includes('/') && MODEL_EXTS.test(rawPath)) continue;
      seen.add(rawPath);
      const base = resourcePath.replace(/\/$/, '');
      const rel = rawPath.replace(/^\//, '');
      // ARK source images (suns, sprites, faction icons) live under sourceimages/.
      // Bare relative paths in the bundle omit that prefix, so add it unless present.
      const url = rawPath.startsWith('http')
        ? rawPath
        : rawPath.startsWith('static/starmap/')
          ? `${RSI_CDN_BASE_URL}/${rawPath}`
          : rel.startsWith('sourceimages/')
            ? `${base}/${rel}`
            : `${base}/sourceimages/${rel}`;
      addAsset(assets, url);
    }
    logger.info(`[starmap-assets] static ARK bundle: ${assets.textures.length}T ${assets.models.length}M ${assets.skybox.length}Sky`);
    return assets;
  })();
  return staticBundleAssetsCache;
}

// ── Main scrape function ───────────────────────────────────────────────────────

export async function scrapeStarmapSystemAssets(
  systems: StarmapSystem[],
  opts: AssetScrapeOptions = {},
): Promise<Map<string, ScrapedAssets>> {
  const { concurrency = 1, waitMs = 6000, onProgress } = opts;
  const results = new Map<string, ScrapedAssets>();
  const total = systems.length;
  let staticFallback: ScrapedAssets | null = null;

  try {
    staticFallback = await scrapeStaticBundleAssets();
  } catch (err) {
    logger.warn(`[starmap-assets] static ARK bundle unavailable: ${(err as Error).message}`);
  }

  if (staticFallback && staticFallback.textures.length + staticFallback.models.length + staticFallback.skybox.length > 0) {
    for (const sys of systems) {
      results.set(sys.code, {
        textures: [...staticFallback.textures],
        models: [...staticFallback.models],
        skybox: [...staticFallback.skybox],
        raw: [...staticFallback.raw],
      });
    }
    onProgress?.(
      `Starmap assets: using static ARK bundle fallback for ${systems.length} system(s) (${staticFallback.textures.length} textures, ${staticFallback.models.length} models, ${staticFallback.skybox.length} skybox)`,
    );
    return results;
  }

  if (concurrency <= 1) {
    for (let i = 0; i < total; i++) {
      const sys = systems[i];
      onProgress?.(`[${i + 1}/${total}] Scraping ARK Starmap assets: ${sys.name} (${sys.code})…`);
      try {
        const assets = await scrapeSystemPage(sys, waitMs);
        results.set(sys.code, assets);
        const total = assets.textures.length + assets.models.length + assets.skybox.length;
        onProgress?.(
          `  ✅ ${total} assets (${assets.textures.length} textures, ${assets.models.length} models, ${assets.skybox.length} skybox)`,
        );
      } catch (err) {
        onProgress?.(`  ❌ Error scraping ${sys.name}: ${(err as Error).message}`);
        logger.warn(`[starmap-assets] error scraping ${sys.code}: ${(err as Error).message}`);
      }
    }
  } else {
    let done = 0;
    for (let i = 0; i < total; i += concurrency) {
      const batch = systems.slice(i, i + concurrency);
      const settled = await Promise.allSettled(batch.map((sys) => scrapeSystemPage(sys, waitMs)));
      for (let j = 0; j < batch.length; j++) {
        done++;
        const sys = batch[j];
        const result = settled[j];
        onProgress?.(`[${done}/${total}] ${sys.name} (${sys.code})`);
        if (result.status === 'fulfilled') {
          results.set(sys.code, result.value);
          const t = result.value.textures.length + result.value.models.length;
          onProgress?.(`  ✅ ${t} assets found`);
        } else {
          onProgress?.(`  ❌ ${(result.reason as Error).message}`);
        }
      }
    }
  }

  return results;
}

// ── Per-system page scraping ───────────────────────────────────────────────────

async function scrapeSystemPage(sys: StarmapSystem, waitMs: number): Promise<ScrapedAssets> {
  const url = `${RSI_BASE_URL}/starmap/systems/${sys.code}`;
  const captured = new Set<string>();
  const assets = emptyScrapedAssets();

  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    // Intercept all network responses before navigation
    page.on('response', (response) => {
      const respUrl = response.url();
      if (captured.has(respUrl)) return;
      captured.add(respUrl);

      const cat = categorizeUrl(respUrl);
      if (!cat) return;

      addAsset(assets, respUrl);
    });

    // Navigate and wait for the 3D scene to initialise
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await sleep(3000);

    // Dismiss cookie banners
    await dismissCookieBanner(page);

    // Reload for network-idle to ensure initial asset batch is captured
    await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
    await sleep(2000);

    // Interact with the WebGL canvas to trigger additional asset streaming
    await interactWithCanvas(page);
    await sleep(waitMs);

    // Try to trigger body-specific assets by clicking on planets/moons
    await triggerBodyAssets(page, sys.code);
    await sleep(Math.round(waitMs / 2));
  } finally {
    await browser.close();
  }

  if (assetCount(assets) === 0) {
    try {
      mergeAssets(assets, await scrapeStaticBundleAssets());
    } catch (err) {
      logger.warn(`[starmap-assets] static bundle fallback failed for ${sys.code}: ${(err as Error).message}`);
    }
  }

  logger.info(`[starmap-assets] ${sys.code}: ${assets.textures.length}T ${assets.models.length}M ${assets.skybox.length}Sky`);
  return assets;
}

// ── Interaction helpers ────────────────────────────────────────────────────────

const COOKIE_SELECTORS = ['button:text("Accept")', 'button:text("Accepter")', 'button:text-is("Accept All")', 'button:text("I Agree")'];

async function dismissCookieBanner(page: Page): Promise<void> {
  for (const selector of COOKIE_SELECTORS) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click();
        await sleep(800);
        return;
      }
    } catch {
      // not found — continue
    }
  }
}

async function interactWithCanvas(page: Page): Promise<void> {
  try {
    const canvas = await page.waitForSelector('canvas', { timeout: 10_000 });
    const box = await canvas.boundingBox();
    if (!box) return;

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Zoom and pan to trigger LOD texture loading
    await page.mouse.move(cx, cy);
    await sleep(200);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, -120);
      await sleep(150);
    }
    await sleep(500);
    // Rotate to reveal back-face textures
    await page.mouse.down();
    await page.mouse.move(cx + 100, cy + 60, { steps: 10 });
    await page.mouse.move(cx - 100, cy - 60, { steps: 10 });
    await page.mouse.up();
    await sleep(300);
    // Zoom out to see full system
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 120);
      await sleep(100);
    }
  } catch {
    // Canvas not found or interaction failed — assets loaded without interaction
  }
}

async function triggerBodyAssets(page: Page, systemCode: string): Promise<void> {
  // Try clicking on different areas of the canvas to trigger celestial body selection,
  // which often triggers higher-resolution texture loading for that body.
  try {
    const canvas = page.locator('canvas').first();
    if (!(await canvas.isVisible({ timeout: 3000 }))) return;
    const box = await canvas.boundingBox();
    if (!box) return;

    // Click on a 3×3 grid of points across the canvas to try selecting various bodies
    for (let xi = 0; xi < 3; xi++) {
      for (let yi = 0; yi < 3; yi++) {
        const x = box.x + (box.width / 4) * (xi + 1);
        const y = box.y + (box.height / 4) * (yi + 1);
        await page.mouse.click(x, y);
        await sleep(600);
      }
    }

    logger.debug(`[starmap-assets] triggered body selection for ${systemCode}`);
  } catch {
    // Interaction failed silently
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
