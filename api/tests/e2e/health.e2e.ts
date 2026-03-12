import { expect, test } from '@playwright/test';

test.describe('Health Checks', () => {
  test('GET /health/live should return 200', async ({ request }) => {
    const response = await request.get('/health/live');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.timestamp).toBeDefined();
  });

  test('GET /health/ready should check DB + Redis', async ({ request }) => {
    const response = await request.get('/health/ready');
    expect([200, 503]).toContain(response.status());

    const data = await response.json();
    expect(data.status).toMatch(/^(ready|not_ready)$/);
    expect(data.checks).toHaveProperty('database');
    expect(data.checks).toHaveProperty('redis');
  });

  test('GET /health/metrics should return Prometheus metrics', async ({ request }) => {
    const response = await request.get('/health/metrics');
    expect(response.status()).toBe(200);

    const metrics = await response.text();
    expect(metrics).toContain('starvis_');
    expect(metrics).toContain('http_requests_total');
    expect(metrics).toContain('http_request_duration_seconds');
  });

  test('GET /health/cache/stats should return cache statistics', async ({ request }) => {
    const response = await request.get('/health/cache/stats');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.hits).toBeGreaterThanOrEqual(0);
    expect(data.misses).toBeGreaterThanOrEqual(0);
    expect(data.total).toBeGreaterThanOrEqual(0);
    expect(data).toHaveProperty('hitRate');
    expect(data).toHaveProperty('connected');
  });
});
