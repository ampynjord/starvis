/**
 * CTM Scraper — Playwright-based scraper for Star Citizen 3D model URLs.
 *
 * Navigates RSI ship pledge pages, intercepts network responses to capture
 * the .ctm (CTM/WebGL model) file URL served by the RSI 3D viewer.
 *
 * The modèle 3D is loaded lazily by the RSI page's WebGL viewer. Running
 * headful (headless=false) is required because many browsers disable WebGL
 * in headless mode.
 */

import { chromium } from 'playwright';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ShipToScrape {
  /** Internal class name, e.g. "ANVL_Arrow" */
  className: string;
  /** Human-readable ship name, e.g. "Arrow" */
  name: string;
  /** RSI relative URL from ship_matrix.url, e.g. "/pledge/ships/anvil-arrow/Arrow" */
  rsiUrl: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const RSI_BASE = 'https://robertsspaceindustries.com';
/** Time to wait for the 3D model to fully load after canvas interaction */
const CTM_WAIT_MS = 15_000;
const INTER_SHIP_DELAY_MS = 1_500;

const COOKIE_SELECTORS = [
  'button:text("Accept")',
  'button:text("Accepter")',
  'button:text-is("Accept All")',
  'button:text("I Agree")',
  'button:text("Agree")',
];

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Scrape CTM model URLs for the given ships.
 *
 * @param ships     Array of ships to scrape (class_name + name + RSI URL)
 * @param onProgress Optional progress callback
 * @returns Map of className → ctmUrl (only ships for which a CTM was found)
 */
export async function scrapeShipCtmUrls(ships: ShipToScrape[], onProgress?: (msg: string) => void): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  for (let i = 0; i < ships.length; i++) {
    const ship = ships[i];
    onProgress?.(`[${i + 1}/${ships.length}] Scraping CTM: ${ship.name} (${ship.className})…`);

    try {
      const ctmUrl = await scrapeOnePage(ship);
      if (ctmUrl) {
        results.set(ship.className, ctmUrl);
        onProgress?.(`  ✅ CTM found: ${ctmUrl}`);
      } else {
        onProgress?.(`  ○ No CTM for ${ship.name}`);
      }
    } catch (err) {
      onProgress?.(`  ❌ Error scraping ${ship.name}: ${(err as Error).message}`);
    }

    if (i < ships.length - 1) {
      await sleep(INTER_SHIP_DELAY_MS);
    }
  }

  return results;
}

// ── Private helpers ────────────────────────────────────────────────────────

async function scrapeOnePage(ship: ShipToScrape): Promise<string | null> {
  const fullUrl = `${RSI_BASE}${ship.rsiUrl}`;
  const foundCtm: string[] = [];

  // headful=true is required: WebGL/3D viewer is often disabled in headless mode
  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    // Register response interceptor BEFORE any navigation
    page.on('response', (response) => {
      const url = response.url();
      if (
        url.toLowerCase().includes('.ctm') &&
        !url.includes('/static/ctm/') &&
        !url.toLowerCase().includes('man.ctm') &&
        !foundCtm.includes(url)
      ) {
        foundCtm.push(url);
      }
    });

    // Initial page load
    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await sleep(2_000);

    // Dismiss cookie consent banner if present
    for (const selector of COOKIE_SELECTORS) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 1_500 })) {
          await btn.click();
          await sleep(800);
          break;
        }
      } catch {
        // Selector not found — continue
      }
    }

    // Force a reload to trigger the 3D viewer initialisation with network idle
    await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });

    // Scroll to reveal the 3D viewer section
    await page.evaluate('window.scrollTo(0, 1600)');
    await sleep(2_000);

    // Wait for canvas then interact to trigger model loading
    try {
      const canvas = await page.waitForSelector('canvas', { timeout: 10_000 });
      const box = await canvas.boundingBox();
      if (box) {
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;

        await page.mouse.move(cx, cy);
        await sleep(300);
        // Zoom in/out to trigger texture/model streaming
        await page.mouse.wheel(0, -100);
        await sleep(300);
        await page.mouse.wheel(0, 100);
        await sleep(300);
        // Rotate model to trigger secondary mesh loading
        await page.mouse.down();
        await page.mouse.move(cx + 50, cy + 50);
        await page.mouse.up();
      }
    } catch {
      // No canvas visible for this ship (not yet flight-ready, etc.)
    }

    // Wait for the 3D model to fully stream
    await sleep(CTM_WAIT_MS);
  } finally {
    await browser.close();
  }

  return foundCtm[0] ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
