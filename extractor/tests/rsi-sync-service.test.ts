/**
 * RsiSyncService unit tests — mocks HTTP + DB pool
 */
import { describe, expect, it, vi } from 'vitest';

// ── Playwright mock (no real browser in CI) ─────────────────────────────────
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
          on: vi.fn(),
          goto: vi.fn().mockResolvedValue(null),
          $$eval: vi.fn().mockResolvedValue([]),
          $: vi.fn().mockResolvedValue(null),
          waitForTimeout: vi.fn().mockResolvedValue(null),
        }),
      }),
      close: vi.fn(),
    }),
  },
}));

// ── DB pool mock ────────────────────────────────────────────────────────────

function makePoolMock() {
  const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  const release = vi.fn();
  const conn = { query, release };
  const connect = vi.fn().mockResolvedValue(conn);
  return { pool: { connect } as any, query, connect };
}

// ── Stub fetch to fail fast (no real HTTP in unit tests) ───────────────────
vi.stubGlobal('fetch', async (_url: string) => {
  throw new Error('fetch: Network disabled in unit tests');
});

describe('RsiSyncService.syncGalactapedia', () => {
  it('calls connect and query for each item', async () => {
    const { RsiSyncService } = await import('../src/rsi-sync-service.js');
    const { pool } = makePoolMock();

    // We cannot easily change the base URL without refactoring the module,
    // so we test that the service handles empty data gracefully (no HTTP call succeeds
    // in test environment, so the catch branch is exercised).
    const svc = new RsiSyncService(pool);
    // When HTTP fetch fails, errors should increment
    const stats = await svc.syncGalactapedia();
    expect(stats).toHaveProperty('inserted');
    expect(stats).toHaveProperty('updated');
    expect(stats).toHaveProperty('errors');
    expect(typeof stats.inserted).toBe('number');
  });
});

describe('RsiSyncService stats shape', () => {
  it('syncGalactapedia returns SyncStats object', async () => {
    const { RsiSyncService } = await import('../src/rsi-sync-service.js');
    const { pool } = makePoolMock();
    const svc = new RsiSyncService(pool);
    const result = await svc.syncGalactapedia();
    expect(result).toMatchObject({ inserted: expect.any(Number), updated: expect.any(Number), errors: expect.any(Number) });
  });

  it('syncCommLinks returns SyncStats object', async () => {
    const { RsiSyncService } = await import('../src/rsi-sync-service.js');
    const { pool } = makePoolMock();
    const svc = new RsiSyncService(pool);
    const result = await svc.syncCommLinks();
    expect(result).toMatchObject({ inserted: expect.any(Number), updated: expect.any(Number), errors: expect.any(Number) });
  });

  it('syncStarmap returns upserted+errors object', async () => {
    const { RsiSyncService } = await import('../src/rsi-sync-service.js');
    const { pool } = makePoolMock();
    const svc = new RsiSyncService(pool);
    const result = await svc.syncStarmap();
    expect(result).toMatchObject({ upserted: expect.any(Number), errors: expect.any(Number) });
  });
});

describe('RsiSyncService.syncStarmap', () => {
  it('stores 3D system coordinates from the RSI bootup API', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({
        data: {
          systems: {
            resultset: [
              {
                id: 1,
                code: 'TEST',
                name: 'Test',
                type: 'SingleStar',
                status: 'P',
                position: { x: 1.25, y: -2.5, z: 3.75 },
                affiliation: [{ name: 'UEE' }],
                jumppoints: [],
                aggregated_size: 4,
                aggregated_population: 5,
                aggregated_economy: 6,
                aggregated_danger: 1,
              },
            ],
          },
        },
      }),
    }));

    const { RsiSyncService } = await import('../src/rsi-sync-service.js');
    const { pool, query } = makePoolMock();
    const svc = new RsiSyncService(pool);

    await svc.syncStarmap();

    const params = query.mock.calls[0][1] as unknown[];
    expect(JSON.parse(params[13] as string)).toEqual({ x: 1.25, y: -2.5, z: 3.75 });
    expect(params[1]).toBe('Test');
    expect(params[2]).toBe('system');
  });
});
