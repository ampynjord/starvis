import { expect, test } from '@playwright/test';

test.describe('Paints API', () => {
  test('GET /api/v1/paints should return paginated paints', async ({ request }) => {
    const response = await request.get('/api/v1/paints?page=1&limit=10');
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

  test('GET /api/v1/paints?search=<query> should support search', async ({ request }) => {
    const response = await request.get('/api/v1/paints?search=invictus&limit=10');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.count).toBeGreaterThanOrEqual(0);
    expect(data.count).toBeLessThanOrEqual(10);
  });

  test('GET /api/v1/paints?format=csv should return CSV output', async ({ request }) => {
    const response = await request.get('/api/v1/paints?limit=5&format=csv');
    expect(response.status()).toBe(200);

    const contentType = response.headers()['content-type'] || '';
    expect(contentType).toContain('text/csv');

    const csv = await response.text();
    if (csv.trim().length > 0) {
      const firstLine = csv.split('\n')[0] || '';
      expect(firstLine.length).toBeGreaterThan(0);
    }
  });

  test('ETag caching should work on /api/v1/paints', async ({ request }) => {
    const response1 = await request.get('/api/v1/paints?limit=10');
    expect(response1.status()).toBe(200);

    const etag = response1.headers().etag;
    expect(etag).toBeDefined();

    const response2 = await request.get('/api/v1/paints?limit=10', {
      headers: { 'If-None-Match': etag! },
    });
    expect(response2.status()).toBe(304);
  });
});
