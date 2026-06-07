import { expect, test } from '@playwright/test';

test('starmap renders a non-empty WebGL canvas', async ({ page }) => {
  await page.goto('/starmap');

  await expect(page.getByRole('heading', { name: /starvis starmap/i })).toBeVisible();

  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();

  await page.waitForTimeout(1500);

  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(300);
  expect(box?.height).toBeGreaterThan(300);

  const screenshot = await canvas.screenshot();
  expect(screenshot.byteLength).toBeGreaterThan(20_000);
});
