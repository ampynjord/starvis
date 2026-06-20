import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

test('personal fleet does not require corporation membership', async ({ context, page }) => {
  await page.addInitScript(() => {
    window.__STARVIS_E2E_USER__ = {
      id: 7,
      uuid: 'user-pilot',
      username: 'pilot',
      email: 'pilot@example.test',
      role: 'user',
      avatarUrl: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      emailVerified: true,
      twoFactorEnabled: false,
    };
  });

  await context.addCookies([
    {
      name: 'starvis_token',
      value: 'playwright-token',
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      json: {
        user: { id: 7, username: 'pilot', email: 'pilot@example.test', role: 'user', avatarUrl: null },
      },
    });
  });

  await page.route('**/api/corp/fleet', async (route) => {
    await route.fulfill({
      json: {
        success: true,
        corporation: null,
        scope: 'personal',
        data: [
          {
            id: 101,
            shipUuid: 'ship-aurora',
            itemClassName: 'rsi_aurora_mr',
            notes: null,
            gridX: 0,
            gridZ: 0,
            availableForTactics: false,
            addedAt: '2026-01-01T00:00:00.000Z',
            addedBy: { id: 7, username: 'pilot' },
          },
        ],
      },
    });
  });

  await page.route('**/api/corp/members', async (route) => {
    await route.fulfill({
      status: 403,
      json: { success: false, error: 'Not a corporation member' },
    });
  });

  await page.route('**/api/public/v1/ships/ship-aurora**', async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          uuid: 'ship-aurora',
          name: 'Aurora MR',
          class_name: 'rsi_aurora_mr',
          manufacturer_name: 'Roberts Space Industries',
          manufacturer_code: 'RSI',
          role: 'Starter',
          career: 'General',
          crew_size: 1,
          scm_speed: 210,
          thumbnail: null,
          thumbnail_large: null,
          is_concept_only: false,
          ctm_url: null,
        },
      },
    });
  });

  await gotoApp(page, '/corp/fleet');

  await expect(page.getByRole('heading', { name: 'Fleet Manager' })).toBeVisible();
  await expect(page.getByText('Personal Fleet')).toBeVisible();
  await expect(page.getByText('Not a corporation member')).not.toBeVisible();
  await expect(page.getByText('Aurora MR').first()).toBeVisible();

  await page.getByRole('button', { name: 'Install' }).click();
  await expect(page.getByRole('link', { name: 'Chrome' })).toHaveAttribute(
    'href',
    '/downloads/extensions/starvis-rsi-hangar-sync-chrome.zip',
  );
  await expect(page.getByRole('link', { name: 'Firefox' })).toHaveAttribute(
    'href',
    '/downloads/extensions/starvis-rsi-hangar-sync-firefox.zip',
  );
});
