import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

test('starmap embeds the RSI Ark Starmap iframe', async ({ page }) => {
  await gotoApp(page, '/starmap');

  await expect(page.locator('iframe[title="RSI Ark Starmap"]')).toBeVisible();
  await expect(page.locator('iframe[src="https://robertsspaceindustries.com/starmap"]')).toBeVisible();
});
