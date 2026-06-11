import { expect, test } from '@playwright/test';

test('legal page presents proprietary source code terms', async ({ page }) => {
  await page.goto('/legal');

  await expect(page.getByRole('heading', { name: /legal notice/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /legal publisher/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /terms of use/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /privacy policy/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /cookies and local storage/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /AI assistant transparency/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /source code license/i })).toBeVisible();
  await expect(page.getByText(/source code and associated project files are proprietary/i)).toBeVisible();
  await expect(page.getByText(/does not grant permission to use, copy, modify, host, distribute/i)).toBeVisible();
  await expect(page.getByText(/email verification token hash/i)).toBeVisible();
  await expect(page.getByText(/Mistral AI may process AI prompts/i)).toBeVisible();
  await expect(page.locator('#cookies')).toBeVisible();
  await expect(page.getByText(/MIT license/i)).toHaveCount(0);
});
