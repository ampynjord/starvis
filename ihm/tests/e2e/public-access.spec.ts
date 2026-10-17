import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

// Starvis has no user accounts (docs/renaissance.md, D1): every page is public,
// and the former account pages send visitors somewhere useful instead of a 404.

test('former account and admin pages redirect home', async ({ page }) => {
  for (const path of ['/login', '/register', '/profile', '/admin', '/admin/monitoring']) {
    await gotoApp(page, path);
    await expect(page, `${path} should redirect home`).toHaveURL(/\/$/);
  }
});

test('the API page is public and explains anonymous access', async ({ page }) => {
  await gotoApp(page, '/developer');

  await expect(page).toHaveURL(/\/developer$/);
  await expect(page.getByRole('heading', { name: /public api/i })).toBeVisible();
  await expect(page.getByText(/answers\s+without credentials/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /open swagger/i })).toHaveAttribute('href', '/api-docs');
});

test('the shell no longer offers to sign in', async ({ page }) => {
  await gotoApp(page, '/');

  await expect(page.getByRole('link', { name: /sign in/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /create account/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /report bug/i }).first()).toHaveAttribute('href', /github\.com\/ampynjord\/starvis\/issues/);
});
