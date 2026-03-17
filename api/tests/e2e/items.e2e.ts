import { expect, test } from '@playwright/test';

test.describe('Items API', () => {
  test('GET /api/v1/items should return paginated items', async ({ request }) => {
    const response = await request.get('/api/v1/items?page=1&limit=10');
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

  test('GET /api/v1/items?type=<type> should filter by single type', async ({ request }) => {
    const response = await request.get('/api/v1/items?type=Armor&limit=10');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    if (data.count > 0) {
      expect(data.data.every((item: any) => item.type === 'Armor')).toBe(true);
    }
  });

  test('GET /api/v1/items?types=<comma-separated> should filter by multiple types', async ({ request }) => {
    const response = await request.get('/api/v1/items?types=Armor,Helmet&limit=50');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    if (data.count > 0) {
      // All items should be Armor or Helmet — no other types leaking through
      expect(data.data.every((item: any) => ['Armor', 'Helmet'].includes(item.type))).toBe(true);
    }
  });

  test('GET /api/v1/items?types=<comma-separated> total reflects only matching items', async ({ request }) => {
    // Fetch all items to get the total
    const allResponse = await request.get('/api/v1/items?limit=1');
    const allData = await allResponse.json();
    const totalAll = allData.total;

    // Fetch only Armor+Helmet items
    const filteredResponse = await request.get('/api/v1/items?types=Armor,Helmet&limit=1');
    const filteredData = await filteredResponse.json();
    const totalFiltered = filteredData.total;

    // The filtered total must be less than or equal to the total for all items
    expect(totalFiltered).toBeLessThanOrEqual(totalAll);
    // And pagination pages must reflect the filtered total
    expect(filteredData.pages).toBe(Math.ceil(totalFiltered / filteredData.limit));
  });

  test('GET /api/v1/items/filters should return filter options', async ({ request }) => {
    const response = await request.get('/api/v1/items/filters');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data.types)).toBe(true);
    expect(Array.isArray(data.data.sub_types)).toBe(true);
    expect(Array.isArray(data.data.manufacturers)).toBe(true);
  });
});
