import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

const starmapFixture = [
  {
    id: 1,
    rsi_id: 'STANTON',
    name: 'Stanton',
    type: 'system',
    system_code: 'STANTON',
    system_name: 'Stanton',
    parent_id: null,
    coordinates: { x: 0, y: 0, z: 0 },
    faction_name: 'UEE',
    jump_points: [{ name: 'Pyro' }],
    assets: {
      textures: ['https://cdn.robertsspaceindustries.com/static/starmap/suns/01_Texture.jpg'],
      raw: ['https://cdn.robertsspaceindustries.com/static/starmap/suns/01_Texture.jpg'],
    },
  },
  {
    id: 7,
    rsi_id: 'STANTON-STAR',
    name: 'Stanton Star',
    type: 'star',
    system_code: 'STANTON',
    system_name: 'Stanton',
    parent_id: 'STANTON',
    parent_db_id: 1,
    coordinates: { x: 0, y: 0, z: 0 },
    star_type: 'Main sequence',
  },
  {
    id: 2,
    rsi_id: 'HURSTON',
    name: 'Hurston',
    type: 'planet',
    system_code: 'STANTON',
    system_name: 'Stanton',
    parent_id: 'STANTON',
    parent_db_id: 1,
    coordinates: { x: 12, y: 0, z: -4 },
    faction_name: 'UEE',
  },
  {
    id: 3,
    rsi_id: 'ABERDEEN',
    name: 'Aberdeen',
    type: 'moon',
    system_code: 'STANTON',
    system_name: 'Stanton',
    parent_id: 'HURSTON',
    parent_db_id: 2,
    coordinates: { x: 14, y: 0, z: -5 },
  },
  {
    id: 4,
    rsi_id: 'LORVILLE',
    name: 'Lorville',
    type: 'landing_zone',
    system_code: 'STANTON',
    system_name: 'Stanton',
    parent_id: 'HURSTON',
    parent_db_id: 2,
    coordinates: { x: 12.4, y: 0.2, z: -4.2 },
  },
  {
    id: 5,
    rsi_id: 'EVERUS',
    name: 'Everus Harbor',
    type: 'station',
    system_code: 'STANTON',
    system_name: 'Stanton',
    parent_id: 'HURSTON',
    parent_db_id: 2,
    coordinates: { x: 13, y: 0, z: -3.5 },
  },
  {
    id: 6,
    rsi_id: 'STANTON-PYRO',
    name: 'Pyro Jump Point',
    type: 'jump_point',
    system_code: 'STANTON',
    system_name: 'Stanton',
    parent_id: 'STANTON',
    parent_db_id: 1,
    coordinates: { x: -18, y: 0, z: 8 },
  },
];

async function mockStarmap(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('starvis_cookie_consent', 'accepted');
  });
  await page.route('**/api/public/v1/starmap/positions', async (route) => {
    await route.fulfill({ json: { success: true, data: starmapFixture, total: starmapFixture.length } });
  });
  await page.route('**/api/rsi-assets?**', async (route) => {
    await route.fulfill({
      contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64'),
    });
  });
}

test('starmap renders the native 3D galactic map (no RSI iframe)', async ({ page }) => {
  await mockStarmap(page);
  const assetRequest = page.waitForRequest(
    (request) => request.url().includes('/api/rsi-assets') && request.url().includes('static%2Fstarmap'),
  );
  await gotoApp(page, '/starmap');

  await expect(page.locator('iframe[title="RSI Ark Starmap"]')).toHaveCount(0);
  await expect(page.getByText(/Galactic Map|Loading RSI starmap objects|No RSI starmap objects/i).first()).toBeVisible({ timeout: 15000 });
  await assetRequest;
});

test('starmap enters a system and focuses a body (merged view)', async ({ page }) => {
  await mockStarmap(page);
  await gotoApp(page, '/starmap');

  await page
    .getByRole('button', { name: /Stanton/i })
    .first()
    .click();
  await expect(page.getByText('System Map')).toBeVisible();
  await expect(page.getByText('System contents')).toBeVisible();

  // The merged system view lists every body, including a planet's satellites.
  await expect(page.getByRole('button', { name: /Lorville/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Everus Harbor/i })).toBeVisible();

  await page.getByRole('button', { name: /Hurston/i }).click();
  await expect(page.getByRole('heading', { name: 'Hurston' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Focus$/i })).toBeVisible();
});
