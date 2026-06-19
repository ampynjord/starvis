import { expect, type Page, test } from '@playwright/test';
import { gotoApp } from './helpers';

type Json = Record<string, unknown>;

const paginated = (data: Json[] = [], limit = 20) => ({
  success: true,
  data,
  total: data.length,
  page: 1,
  limit,
  pages: data.length > 0 ? 1 : 0,
});

const ship = {
  uuid: 'ship-aurora-mr',
  name: 'Aurora MR',
  manufacturer_code: 'RSI',
  manufacturer_name: 'Roberts Space Industries',
  role: 'Starter',
  career: 'Transport',
  vehicle_category: 'ship',
  status: 'flight-ready',
  crew_size: 1,
  cargo_capacity: 3,
  scm_speed: 220,
  max_speed: 1210,
  total_hp: 8200,
};

const component = {
  uuid: 'component-bulldog',
  name: 'CF-117 Bulldog',
  type: 'WeaponGun',
  sub_type: 'Repeater',
  manufacturer_name: 'Klaus & Werner',
  size: 1,
  grade: 'A',
  component_class: 'Military',
};

const item = {
  uuid: 'item-p4-ar',
  name: 'P4-AR Rifle',
  type: 'FPS_Weapon',
  sub_type: 'Assault Rifle',
  manufacturer_name: 'Behring',
};

const commodity = {
  uuid: 'commodity-agricium',
  name: 'Agricium',
  type: 'Metal',
  sub_type: 'Ore',
  category: 'Raw Materials',
  occupancy_scu: 1,
};

const mission = {
  uuid: 'mission-delivery',
  name: 'Priority Delivery',
  title: 'Priority Delivery',
  mission_type: 'Delivery',
  faction: 'Covalex',
  location_system: 'Stanton',
  reward_currency: 8500,
  category: 'Courier',
  legal: true,
};

const starmapObjects = [
  {
    id: 1,
    rsi_id: 1,
    name: 'Stanton',
    type: 'system',
    system_code: 'STANTON',
    position_x: 0,
    position_y: 0,
    position_z: 0,
    jump_points: [{ name: 'Pyro' }],
  },
  {
    id: 2,
    rsi_id: 2,
    name: 'ArcCorp',
    type: 'planet',
    system_name: 'Stanton',
    position_x: 16,
    position_y: 4,
    position_z: -10,
  },
  {
    id: 3,
    rsi_id: 3,
    name: 'Baijini Point',
    type: 'station',
    system_name: 'Stanton',
    position_x: 18,
    position_y: 4,
    position_z: -8,
  },
];

async function installMobileFixtures(page: Page) {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ json: { user: null } });
  });

  await page.route('**/api/public/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith('/stats/overview')) {
      return route.fulfill({ json: { success: true, data: { ships: 1, components: 1, items: 1, commodities: 1, missions: 1 } } });
    }
    if (path.endsWith('/version')) {
      return route.fulfill({
        json: { success: true, data: { game_version: '4.8.2', game_env: 'live', extracted_at: '2026-06-01T10:00:00.000Z' } },
      });
    }
    if (path.endsWith('/changelog')) return route.fulfill({ json: paginated([]) });
    if (path.endsWith('/changelog/summary')) {
      return route.fulfill({ json: { success: true, data: { total: 0, added: 0, modified: 0, removed: 0 } } });
    }
    if (path.endsWith('/ships/random')) return route.fulfill({ json: { success: true, data: ship } });
    if (path.endsWith('/ships/filters')) return route.fulfill({ json: { success: true, data: { filters: {} } } });
    if (path.endsWith('/ships')) return route.fulfill({ json: paginated([ship]) });
    if (path.endsWith(`/ships/${ship.uuid}`)) return route.fulfill({ json: { success: true, data: ship } });

    if (path.endsWith('/components/categories')) {
      return route.fulfill({ json: { success: true, data: [{ label: 'Weapons', slug: 'weapons', types: ['WeaponGun'] }] } });
    }
    if (path.endsWith('/components/filters')) return route.fulfill({ json: { success: true, data: { filters: {} } } });
    if (path.endsWith('/components')) return route.fulfill({ json: paginated([component]) });

    if (path.endsWith('/items/navigation')) {
      return route.fulfill({
        json: {
          success: true,
          data: {
            fpsCategories: [{ slug: 'weapons', label: 'Weapons', group: 'weapons', count: 1 }],
            fpsSubTypeOptions: { weapons: [{ value: 'Assault Rifle', label: 'Assault Rifle' }] },
            groups: {},
          },
        },
      });
    }
    if (path.endsWith('/items/manufacturers')) return route.fulfill({ json: { success: true, data: [] } });
    if (path.includes('/items/category/') || path.endsWith('/items')) return route.fulfill({ json: paginated([item]) });

    if (path.endsWith('/commodities/categories')) {
      return route.fulfill({ json: { success: true, data: [{ slug: 'raw-materials', label: 'Raw Materials', count: 1 }] } });
    }
    if (path.endsWith('/commodities')) return route.fulfill({ json: paginated([commodity]) });

    if (path.endsWith('/shops')) {
      return route.fulfill({
        json: paginated([{ id: 1, name: 'TDD Area18', shop_type: 'Commodities', city: 'Area18', system: 'Stanton' }]),
      });
    }
    if (path.endsWith('/trade/systems')) return route.fulfill({ json: { success: true, data: ['Stanton'] } });
    if (path.endsWith('/trade/routes')) {
      return route.fulfill({
        json: {
          success: true,
          data: [
            {
              buyCommodity: 'Agricium',
              buyShop: 'TDD Area18',
              buyLocation: 'Area18',
              buySystem: 'Stanton',
              buyPrice: 25,
              sellShop: 'Admin Office',
              sellLocation: 'Lorville',
              sellSystem: 'Stanton',
              sellPrice: 31,
              profitPerUnit: 6,
              profitPerScu: 600,
              totalProfit: 27600,
              totalInvestment: 115000,
              scu: 46,
            },
          ],
        },
      });
    }

    if (path.endsWith('/missions/types')) return route.fulfill({ json: { success: true, data: ['Delivery'] } });
    if (path.endsWith('/missions/factions')) return route.fulfill({ json: { success: true, data: ['Covalex'] } });
    if (path.endsWith('/missions/systems')) return route.fulfill({ json: { success: true, data: ['Stanton'] } });
    if (path.endsWith('/missions/categories')) return route.fulfill({ json: { success: true, data: ['Courier'] } });
    if (path.endsWith('/missions')) {
      return route.fulfill({
        json: {
          ...paginated([mission]),
          summary: { total: 1, legal: 1, illegal: 0, shared: 0, avgReward: 8500, blueprintRewards: 0 },
        },
      });
    }

    if (path.endsWith('/starmap/positions')) return route.fulfill({ json: { success: true, data: starmapObjects } });
    if (path.endsWith('/search')) {
      return route.fulfill({
        json: {
          success: true,
          data: { ships: [ship], components: [component], items: [item], commodities: [commodity], missions: [mission], recipes: [] },
        },
      });
    }

    return route.fulfill({ json: { success: true, data: [] } });
  });
}

async function expectNoShellHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const main = document.querySelector('main');
    return {
      viewport: root.clientWidth,
      documentScrollWidth: root.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      mainClientWidth: main?.clientWidth ?? 0,
      mainScrollWidth: main?.scrollWidth ?? 0,
    };
  });

  expect(overflow.documentScrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport + 2);
  expect(overflow.bodyScrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport + 2);
  expect(overflow.mainScrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.mainClientWidth + 2);
}

async function expectDrawerInViewport(page: Page) {
  await expect
    .poll(async () => {
      return page.locator('aside').evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= -1 && rect.right > 0;
      });
    })
    .toBe(true);
}

test.describe('@mobile responsive shell', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMobileFixtures(page);
  });

  test('mobile navigation exposes the full app without horizontal overflow', async ({ page }) => {
    await gotoApp(page, '/');
    await page.waitForLoadState('load');
    await expect(page.getByLabel('Open menu')).toBeVisible();
    await page.getByLabel('Open menu').click();
    await expectDrawerInViewport(page);
    const navigation = page.getByRole('navigation');
    await expect(navigation.getByRole('link', { name: /Ships & Vehicles/i })).toBeVisible();
    await expect(navigation.getByRole('link', { name: /Missions/i })).toBeVisible();
    await page.getByLabel('Close menu').click();
    await expect(page.getByLabel('Open menu')).toBeVisible();
    await expectNoShellHorizontalOverflow(page);
  });

  for (const target of [
    { path: '/', heading: /^STARVIS$/i },
    { path: '/ships', heading: /^Ships$/i },
    { path: '/components', heading: /^Components$/i },
    { path: '/items', heading: /^(Equipment|Weapons|Armor|Clothing|Utility|Ammo|Sustenance)$/i },
    { path: '/commodities', heading: /^(Commodities|Trade Goods)$/i },
    { path: '/industrial', heading: /^(Industrial|Commodities|Trade Goods)$/i },
    { path: '/trade', heading: /^Trade (Routes|Calculator)$/i },
    { path: '/trade-calculator', heading: /^Trade Calculator$/i },
    { path: '/missions', heading: /^(Missions|Mission Database)$/i },
    { path: '/starmap', text: /Galactic Map|Loading RSI starmap objects|No RSI starmap objects/i },
  ]) {
    test(`${target.path} remains usable on phone viewport`, async ({ page }) => {
      await gotoApp(page, target.path);
      if ('heading' in target) {
        await expect(page.getByRole('heading', { name: target.heading }).first()).toBeVisible();
      } else {
        await expect(page.getByText(target.text).first()).toBeVisible({ timeout: 15_000 });
      }
      await expect(page.getByRole('banner').getByPlaceholder(/search ships/i)).toBeVisible();
      await expect(page.getByLabel('Open menu')).toBeVisible();
      await expectNoShellHorizontalOverflow(page);
    });
  }
});
