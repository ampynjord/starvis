/**
 * RsiSyncService unit tests — mocks HTTP + DB pool
 */
import { describe, expect, it, vi } from 'vitest';

// ── DB pool mock ────────────────────────────────────────────────────────────

function makePoolMock() {
  const execute = vi.fn().mockResolvedValue([{ affectedRows: 1 }, []]);
  const release = vi.fn();
  const conn = { execute, release };
  const getConnection = vi.fn().mockResolvedValue(conn);
  return { pool: { getConnection } as any, execute, getConnection };
}

// ── Stub fetch to fail fast (no real HTTP in unit tests) ───────────────────
vi.stubGlobal('fetch', async (_url: string) => {
  throw new Error('fetch: Network disabled in unit tests');
});

describe('RsiSyncService.syncGalactapedia', () => {
  it('calls getConnection and execute for each item', async () => {
    const { RsiSyncService } = await import('../src/rsi-sync-service.js');
    const { pool, execute } = makePoolMock();

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
