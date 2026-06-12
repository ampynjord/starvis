import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

test('corporation tactics board adds ships and tactical markers', async ({ context, page }) => {
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
        corporation: { id: 42, name: 'Dawnstar', tag: 'DNR' },
        data: [
          {
            id: 101,
            shipUuid: 'ship-aurora',
            itemClassName: 'rsi_aurora_mr',
            availableForTactics: true,
            addedBy: { id: 7, username: 'pilot' },
          },
          {
            id: 103,
            shipUuid: 'ship-aurora',
            itemClassName: 'rsi_aurora_mr',
            availableForTactics: true,
            addedBy: { id: 7, username: 'pilot' },
          },
          {
            id: 104,
            shipUuid: 'ship-aurora',
            itemClassName: 'rsi_aurora_mr',
            availableForTactics: true,
            addedBy: { id: 7, username: 'pilot' },
          },
          {
            id: 105,
            shipUuid: 'ship-aurora',
            itemClassName: 'rsi_aurora_mr',
            availableForTactics: true,
            addedBy: { id: 7, username: 'pilot' },
          },
          {
            id: 102,
            shipUuid: 'ship-private',
            itemClassName: 'aegis_private',
            availableForTactics: false,
            addedBy: { id: 8, username: 'owner' },
          },
        ],
      },
    });
  });
  await page.route('**/api/v1/ships/ship-aurora**', async (route) => {
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

  await gotoApp(page, '/corp/tactics');

  await expect(page.getByRole('heading', { name: 'Tactics' })).toBeVisible();
  await expect(page.getByText('[DNR] Dawnstar')).toBeVisible();
  await expect(page.getByLabel('Formation ship')).toContainText('Aurora MR');
  await expect(page.getByLabel('Formation ship')).not.toContainText('aegis_private');
  const board = page.getByTestId('tactics-board');
  await page.getByRole('button', { name: /Add formation/i }).click();
  await expect(board.locator('canvas')).toBeVisible();
  await expect(board.getByText(/4 ships/i)).toBeVisible();
  await page.getByRole('button', { name: /Objective/i }).click();
  await expect(board.getByText(/1 objects/i)).toBeVisible();
});
