import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

test('discord bot page exposes invite and command help', async ({ page }) => {
  await gotoApp(page, '/discord');

  await expect(page.getByRole('heading', { name: /discord bot/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /command help/i })).toBeVisible();
  await expect(page.getByText(/Starvis in Discord/i)).toBeVisible();
  await expect(page.getByText('/starvis question: best starter hauling ship?')).toBeVisible();
  await expect(page.getByRole('heading', { name: '/ship' })).toBeVisible();

  const inviteLink = page.getByRole('link', { name: /invite/i }).first();
  const missingConfig = page.getByText(/Discord invite is not configured/i);
  await expect(inviteLink.or(missingConfig)).toBeVisible();
});
