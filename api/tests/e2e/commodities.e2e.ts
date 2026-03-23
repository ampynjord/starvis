import { expect, test } from '@playwright/test';

test.describe('Commodities API', () => {
  test('GET /api/v1/commodities should return 400 on invalid query (search too long)', async ({ request }) => {
    const tooLong = 'x'.repeat(201);
    const response = await request.get(`/api/v1/commodities?search=${tooLong}`);
    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('Validation error');
    expect(Array.isArray(data.details)).toBe(true);
    expect(data.details.length).toBeGreaterThan(0);
  });

  test('GET /api/v1/commodities should return paginated commodities', async ({ request }) => {
    const response = await request.get('/api/v1/commodities?page=1&limit=10');
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

  test('GET /api/v1/commodities?type=<type> should filter by single type', async ({ request }) => {
    const response = await request.get('/api/v1/commodities?type=Ore&limit=25');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    if (data.count > 0) {
      expect(data.data.every((c: any) => c.type === 'Ore')).toBe(true);
    }
  });

  test('GET /api/v1/commodities?types=<comma-separated> should filter by multiple types', async ({ request }) => {
    const response = await request.get('/api/v1/commodities?types=Ore,Mineral&limit=50');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    if (data.count > 0) {
      expect(data.data.every((c: any) => ['Ore', 'Mineral'].includes(c.type))).toBe(true);
    }
  });

  test('GET /api/v1/commodities/types should return commodity types list', async ({ request }) => {
    const response = await request.get('/api/v1/commodities/types');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });

  test('GET /api/v1/commodities?format=csv should return CSV output', async ({ request }) => {
    const response = await request.get('/api/v1/commodities?limit=5&format=csv');
    expect(response.status()).toBe(200);

    const contentType = response.headers()['content-type'] || '';
    expect(contentType).toContain('text/csv');

    const csv = await response.text();
    if (csv.trim().length > 0) {
      const firstLine = csv.split('\n')[0] || '';
      expect(firstLine.length).toBeGreaterThan(0);
    }
  });

  test('ETag caching should work on /api/v1/commodities', async ({ request }) => {
    const response1 = await request.get('/api/v1/commodities?limit=10');
    expect(response1.status()).toBe(200);

    const etag = response1.headers().etag;
    expect(etag).toBeDefined();

    const response2 = await request.get('/api/v1/commodities?limit=10', {
      headers: { 'If-None-Match': etag! },
    });
    expect(response2.status()).toBe(304);
  });

  test('GET /api/v1/commodities/:uuid should return 404 for unknown commodity', async ({ request }) => {
    const response = await request.get('/api/v1/commodities/not-a-real-commodity-uuid');
    expect(response.status()).toBe(404);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('Commodity not found');
  });
});
