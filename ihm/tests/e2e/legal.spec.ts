import { expect, test } from '@playwright/test';

test('legal page presents proprietary source code terms', async ({ page }) => {
  await page.goto('/legal');

  await expect(page.getByRole('heading', { name: /legal notice/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /source code license/i })).toBeVisible();
  await expect(page.getByText(/source code and associated project files are proprietary/i)).toBeVisible();
  await expect(page.getByText(/does not grant permission to use, copy, modify, host, distribute/i)).toBeVisible();
  await expect(page.getByText(/MIT license/i)).toHaveCount(0);
});
