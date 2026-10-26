import { expect, type Page, test } from '@playwright/test';
import { gotoApp } from './helpers';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

const PAGES = [
  { path: '/', heading: /STARVIS/i },
  { path: '/changelog', heading: /^Changelog$/i },
  { path: '/about', heading: /About Starvis/i },
  { path: '/roadmap', heading: /Roadmap/i },
  { path: '/developer', heading: /^(Public API & Datasets|API & Datasets)$/i },
  { path: '/legal', heading: /Legal/i },
] as const;

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return {
      viewport: root.clientWidth,
      documentScrollWidth: root.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
    };
  });
  expect(overflow.documentScrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport + 2);
  expect(overflow.bodyScrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport + 2);
}

test.describe('cockpit DA sobriety', () => {
  for (const viewport of VIEWPORTS) {
    for (const target of PAGES) {
      test(`${target.path} @ ${viewport.name}: no overflow, no scanline`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await gotoApp(page, target.path);
        await expect(page.getByRole('heading', { name: target.heading }).first()).toBeVisible();
        await expect(page.locator('.animate-scanline')).toHaveCount(0);
        await expectNoHorizontalOverflow(page);
      });
    }
  }
});
