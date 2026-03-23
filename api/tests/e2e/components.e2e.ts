import { expect, test } from '@playwright/test';

test.describe('Components API', () => {
  test('GET /api/v1/components should return paginated components', async ({ request }) => {
    const response = await request.get('/api/v1/components?page=1&limit=10');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.page).toBe(1);
    expect(data.limit).toBe(10);
    expect(data.total).toBeGreaterThanOrEqual(0);
    expect(data.pages).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeLessThanOrEqual(10);
    expect(data.meta).toHaveProperty('source', 'Game Data');
  });

  test('GET /api/v1/components?type=<type>&min_size=<n>&max_size=<n> should filter correctly', async ({ request }) => {
    const response = await request.get('/api/v1/components?type=WeaponGun&min_size=1&max_size=4&limit=25');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    if (data.count > 0) {
      expect(data.data.every((c: any) => c.type === 'WeaponGun')).toBe(true);
      expect(data.data.every((c: any) => c.size >= 1 && c.size <= 4)).toBe(true);
    }
  });

  test('GET /api/v1/components?format=csv should return CSV output', async ({ request }) => {
    const response = await request.get('/api/v1/components?limit=5&format=csv');
    expect(response.status()).toBe(200);

    const contentType = response.headers()['content-type'] || '';
    expect(contentType).toContain('text/csv');

    const csv = await response.text();
    if (csv.trim().length > 0) {
      const firstLine = csv.split('\n')[0] || '';
      expect(firstLine.length).toBeGreaterThan(0);
    }
  });

  test('ETag caching should work on /api/v1/components', async ({ request }) => {
    const response1 = await request.get('/api/v1/components?limit=10');
    expect(response1.status()).toBe(200);

    const etag = response1.headers().etag;
    expect(etag).toBeDefined();

    const response2 = await request.get('/api/v1/components?limit=10', {
      headers: { 'If-None-Match': etag! },
    });
    expect(response2.status()).toBe(304);
  });

  test('GET /api/v1/components/filters should return filter options', async ({ request }) => {
    const response = await request.get('/api/v1/components/filters');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data.types)).toBe(true);
    expect(Array.isArray(data.data.sub_types)).toBe(true);
    expect(Array.isArray(data.data.sizes)).toBe(true);
    expect(Array.isArray(data.data.grades)).toBe(true);
  });
});
