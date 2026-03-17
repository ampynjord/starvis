import { expect, test } from '@playwright/test';

test.describe('Ship Matrix API', () => {
  test('GET /api/v1/ship-matrix should return all ships', async ({ request }) => {
    const response = await request.get('/api/v1/ship-matrix');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.count).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.meta).toHaveProperty('source', 'RSI Ship Matrix');
  });

  test('GET /api/v1/ship-matrix?search=<query> should filter ships', async ({ request }) => {
    const response = await request.get('/api/v1/ship-matrix?search=hornet');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.count).toBeGreaterThanOrEqual(0);
    if (data.count > 0) {
      expect(data.data.some((s: any) => s.name.toLowerCase().includes('hornet'))).toBe(true);
    }
  });

  test('GET /api/v1/ship-matrix/:id should return a single ship', async ({ request }) => {
    // First get all ships
    const listResponse = await request.get('/api/v1/ship-matrix');
    const listData = await listResponse.json();
    test.skip(listData.count === 0, 'No ship matrix data in CI');
    const firstShip = listData.data[0];

    // Then get specific ship
    const response = await request.get(`/api/v1/ship-matrix/${firstShip.id}`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('id', firstShip.id);
    expect(data.data).toHaveProperty('name');
  });

  test('GET /api/v1/ship-matrix/stats should return statistics', async ({ request }) => {
    const response = await request.get('/api/v1/ship-matrix/stats');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.total).toBeGreaterThanOrEqual(0);
    expect(data.data).toHaveProperty('flight_ready');
    expect(data.data).toHaveProperty('in_concept');
    expect(data.data).toHaveProperty('in_production');
    expect(data.data).toHaveProperty('manufacturers');
  });

  test('ETag caching should work', async ({ request }) => {
    // First request
    const response1 = await request.get('/api/v1/ship-matrix');
    expect(response1.status()).toBe(200);
    const etag = response1.headers().etag;
    expect(etag).toBeDefined();

    // Second request with If-None-Match header
    const response2 = await request.get('/api/v1/ship-matrix', {
      headers: { 'If-None-Match': etag! },
    });
    expect(response2.status()).toBe(304);
  });
});
