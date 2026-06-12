import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

test('login redirect suggests creating an account for connected features', async ({ page }) => {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ json: { user: null } });
  });

  await gotoApp(page, '/login?redirect=/profile');

  await expect(page.getByText(/This feature is available after sign-in/i)).toBeVisible();
  await expect(page.getByText(/Create a free account to unlock profile tools/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /Create an account/i })).toBeVisible();
});
