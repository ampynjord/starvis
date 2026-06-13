import { expect, type Page, test } from '@playwright/test';
import { gotoApp } from './helpers';

type Json = Record<string, unknown>;

const paginated = (data: Json[] = []) => ({
  success: true,
  data,
  total: data.length,
  page: 1,
  limit: 20,
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
  uuid: 'component-laser-repeat-s1',
  name: 'CF-117 Bulldog',
  type: 'WeaponGun',
  sub_type: 'Repeater',
  manufacturer_name: 'Klaus & Werner',
  size: 1,
  grade: 'A',
  component_class: 'Military',
  weapon_damage: 120,
};

const item = {
  uuid: 'item-p4-ar',
  name: 'P4-AR Rifle',
  type: 'WeaponPersonal',
  sub_type: 'Assault Rifle',
  manufacturer_name: 'Behring',
};

const commodity = {
  uuid: 'commodity-agricium',
  name: 'Agricium',
  type: 'Metal',
  category: 'RawMaterial',
};

async function installApiFixtures(page: Page) {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ json: { user: null } });
  });

  await page.route('**/api/public/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith('/stats/overview')) {
      return route.fulfill({ json: { success: true, data: { ships: 1, components: 1, items: 1, commodities: 1 } } });
    }
    if (path.endsWith('/version')) {
      return route.fulfill({
        json: { success: true, data: { game_version: '4.8.1', game_env: 'live', extracted_at: '2026-06-01T10:00:00.000Z' } },
      });
    }
    if (path.endsWith('/changelog')) {
      return route.fulfill({
        json: paginated([{ id: 1, change_type: 'added', entity_type: 'ship', entity_uuid: ship.uuid, entity_name: ship.name }]),
      });
    }
    if (path.endsWith('/changelog/summary')) {
      return route.fulfill({ json: { success: true, data: { total: 1, added: 1, modified: 0, removed: 0 } } });
    }
    if (path.endsWith('/ships/random')) {
      return route.fulfill({ json: { success: true, data: ship } });
    }
    if (path.endsWith('/ships/filters')) {
      return route.fulfill({
        json: {
          success: true,
          data: {
            filters: {
              manufacturer: [{ value: 'RSI', label: 'Roberts Space Industries', count: 1 }],
              status: [{ value: 'flight-ready', label: 'Flight Ready', count: 1 }],
              career: [{ value: 'Transport', count: 1 }],
              role: [{ value: 'Starter', count: 1 }],
              variant_type: [{ value: 'Base', count: 1 }],
              vehicle_category: [{ value: 'ship', count: 1 }],
            },
          },
        },
      });
    }
    if (path.endsWith('/ships')) return route.fulfill({ json: paginated([ship]) });
    if (path.endsWith(`/ships/${ship.uuid}`)) return route.fulfill({ json: { success: true, data: ship } });

    if (path.endsWith('/components/categories')) {
      return route.fulfill({ json: { success: true, data: [{ label: 'Weapons', slug: 'weapons', types: ['WeaponGun'] }] } });
    }
    if (path.endsWith('/components/filters')) {
      return route.fulfill({
        json: {
          success: true,
          data: {
            filters: {
              size: [{ value: '1', label: 'S1', count: 1 }],
              grade: [{ value: 'A', count: 1 }],
              component_class: [{ value: 'Military', count: 1 }],
              manufacturer: [{ value: 'K&W', label: 'Klaus & Werner', count: 1 }],
            },
          },
        },
      });
    }
    if (path.endsWith('/components')) return route.fulfill({ json: paginated([component]) });

    if (path.endsWith('/items/navigation')) {
      return route.fulfill({
        json: {
          success: true,
          data: {
            fpsCategories: [{ slug: 'weapons', label: 'Weapons', group: 'weapons', count: 1 }],
            fpsSubTypeOptions: { weapons: [{ value: 'Assault Rifle', count: 1 }] },
          },
        },
      });
    }
    if (path.endsWith('/items/manufacturers')) {
      return route.fulfill({ json: { success: true, data: [{ value: 'BEH', label: 'Behring' }] } });
    }
    if (path.includes('/items/category/') || path.endsWith('/items')) return route.fulfill({ json: paginated([item]) });

    if (path.endsWith('/commodities/categories')) {
      return route.fulfill({ json: { success: true, data: [{ slug: 'raw-materials', label: 'Raw Materials', count: 1 }] } });
    }
    if (path.endsWith('/commodities')) return route.fulfill({ json: paginated([commodity]) });

    if (path.endsWith('/search')) {
      return route.fulfill({
        json: {
          success: true,
          data: { ships: [ship], components: [component], items: [item], commodities: [commodity], missions: [], recipes: [] },
        },
      });
    }

    return route.fulfill({ json: { success: true, data: [] } });
  });
}

test.describe('@critical application flows', () => {
  test.beforeEach(async ({ page }) => {
    await installApiFixtures(page);
  });

  function watchBrowserErrors(page: Page) {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') pageErrors.push(message.text());
    });
    return pageErrors;
  }

  test('home search navigates to populated search results', async ({ page }) => {
    const pageErrors = watchBrowserErrors(page);
    await gotoApp(page, '/');
    await expect(page.getByRole('heading', { name: 'STARVIS' })).toBeVisible();
    const heroSearch = page.getByRole('main').getByPlaceholder(/search ships/i);
    await heroSearch.click();
    await heroSearch.pressSequentially('aurora');
    await expect(heroSearch).toHaveValue('aurora');
    await page.getByRole('button', { name: /Search Starvis/i }).click();
    await expect(page).toHaveURL(/\/search\?q=aurora/);
    await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible();
    await expect(page.getByText('Aurora MR').first()).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('data library pages render usable records', async ({ page }) => {
    const pageErrors = watchBrowserErrors(page);
    const pages = [
      { path: '/ships', heading: 'Ships', text: 'Aurora MR' },
      { path: '/components', heading: 'Components', text: 'CF-117 Bulldog' },
      { path: '/weapons', heading: /Weapons|Equipment/i, text: 'P4-AR Rifle' },
      { path: '/commodities', heading: 'Commodities', text: 'Agricium' },
    ];

    for (const target of pages) {
      await gotoApp(page, target.path);
      await expect(page.getByRole('heading', { name: target.heading })).toBeVisible();
      await expect(page.getByText(target.text).first()).toBeVisible();
    }
    expect(pageErrors).toEqual([]);
  });
});
