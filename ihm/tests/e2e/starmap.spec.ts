import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

test('starmap renders the native 3D galactic map (no RSI iframe)', async ({ page }) => {
  await gotoApp(page, '/starmap');

  await expect(page.locator('iframe[title="RSI Ark Starmap"]')).toHaveCount(0);
  await expect(page.getByText(/Galactic Map|Loading star systems|No star systems/i).first()).toBeVisible({ timeout: 15000 });
});
