import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

const calculatorPages = [
  { path: '/trade-calculator', heading: /trade calculator/i, signal: /route calculator/i },
  { path: '/mining-calculator', heading: /mining calculator/i, signal: /yield workflow/i },
  { path: '/fps-calculator', heading: /fps calculator/i, signal: /weapon selection|no fps weapon data|loading fps weapons/i },
  { path: '/loadout-manager', heading: /loadout manager/i, signal: /select ship|computing loadout|weapon/i },
  { path: '/crafting-calculator', heading: /crafting calculator/i, signal: /recipe detail|loading blueprints|no blueprints/i },
];

for (const pageDef of calculatorPages) {
  test(`${pageDef.path} renders an actionable calculator view`, async ({ page }) => {
    await gotoApp(page, pageDef.path);

    await expect(page.getByRole('heading', { name: pageDef.heading })).toBeVisible();
    await expect(page.getByText(pageDef.signal).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/Unhandled Runtime Error|Application error/i);
  });
}
