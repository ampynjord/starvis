import { expect, test } from '@playwright/test';

test.describe('Ships API', () => {
  test('GET /api/v1/ships should return paginated ships', async ({ request }) => {
    const response = await request.get('/api/v1/ships?page=1&limit=10');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.page).toBe(1);
    expect(data.limit).toBe(10);
    expect(data.total).toBeGreaterThan(0);
    expect(data.pages).toBeGreaterThan(0);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeLessThanOrEqual(10);
  });

  test('GET /api/v1/ships?manufacturer=<code> should filter by manufacturer', async ({ request }) => {
    const response = await request.get('/api/v1/ships?manufacturer=ANVL&limit=5');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    if (data.count > 0) {
      // All ships should be from Anvil Aerospace
      expect(data.data.every((s: any) => s.manufacturer_code === 'ANVL')).toBe(true);
    }
  });

  test('GET /api/v1/ships/filters should return filter options', async ({ request }) => {
    const response = await request.get('/api/v1/ships/filters');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data.manufacturers)).toBe(true);
    expect(Array.isArray(data.data.roles)).toBe(true);
    expect(Array.isArray(data.data.careers)).toBe(true);
    expect(Array.isArray(data.data.variant_types)).toBe(true);
  });

  test('GET /api/v1/ships/search should support autocomplete', async ({ request }) => {
    const response = await request.get('/api/v1/ships/search?search=aurora&limit=5');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.count).toBeGreaterThanOrEqual(0);
    expect(data.count).toBeLessThanOrEqual(5);
  });

  test('GET /api/v1/ships/random should return a random ship', async ({ request }) => {
    test.skip(!!process.env.CI, 'Requires P4K game data, not available in CI environment');

    const response = await request.get('/api/v1/ships/random');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('uuid');
    expect(data.data).toHaveProperty('name');
    expect(data.data).toHaveProperty('class_name');
  });

  test('GET /api/v1/ships/:uuid should return ship details', async ({ request }) => {
    test.skip(!!process.env.CI, 'Requires P4K game data, not available in CI environment');

    const listResponse = await request.get('/api/v1/ships?limit=1');
    const listData = await listResponse.json();
    const uuid = listData.data[0].uuid;

    // Then get ship details
    const response = await request.get(`/api/v1/ships/${uuid}`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('uuid', uuid);
    expect(data.data).toHaveProperty('name');
    expect(data.data).toHaveProperty('class_name');
  });

  test('GET /api/v1/ships/:uuid/loadout should return ship loadout', async ({ request }) => {
    test.skip(!!process.env.CI, 'Requires P4K game data, not available in CI environment');

    const listResponse = await request.get('/api/v1/ships?limit=1');
    const listData = await listResponse.json();
    const uuid = listData.data[0].uuid;

    // Then get loadout
    const response = await request.get(`/api/v1/ships/${uuid}/loadout`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });
});
