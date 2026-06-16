import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

test('starmap renders a non-empty WebGL canvas', async ({ page }) => {
  await gotoApp(page, '/starmap');

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

test('starmap search selects matching systems and objects', async ({ page }) => {
  await gotoApp(page, '/starmap');

  await expect(page.getByRole('heading', { name: /starvis starmap/i })).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();

  const search = page.getByPlaceholder(/search system, planet, moon/i);
  await expect(search).toBeVisible();
  await search.fill('Stanton');
  await expect(search).toHaveValue('Stanton');

  await expect(page.getByText(/search results/i)).toBeVisible();
  await expect(
    page
      .locator('aside')
      .last()
      .getByRole('heading', { name: /stanton/i }),
  ).toBeVisible();
});
