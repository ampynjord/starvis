import { describe, it, expect, vi, afterEach } from 'vitest';
import { api } from '@/services/api';

// Basic fixtures
const mockOverview = { ships: 309, components: 3023, items: 0, manufacturers: 42, paints: 0, commodities: 0 };
const mockVersion = { game_version: '4.0.1', extracted_at: '2024-06-01T00:00:00Z', ships_count: 309, components_count: 3023 };
const mockShipList = {
  data: [{ uuid: 'abc', name: 'Hornet F7C', manufacturer: 'Anvil', manufacturer_code: 'ANVL' }],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
};
const mockShip = { uuid: 'abc', name: 'Hornet F7C', manufacturer: 'Anvil', manufacturer_code: 'ANVL' };

function mockFetch(data: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? 'OK' : 'Not Found',
    json: vi.fn().mockResolvedValue(data),
  });
}

describe('api.stats', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('overview() calls /api/v1/stats/overview', async () => {
    global.fetch = mockFetch(mockOverview);
    const result = await api.stats.overview();
    expect(result).toEqual(mockOverview);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain('/api/v1/stats/overview');
  });

  it('version() calls /api/v1/version', async () => {
    global.fetch = mockFetch(mockVersion);
    const result = await api.stats.version();
    expect(result).toEqual(mockVersion);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('/api/v1/version');
  });
});

describe('api.ships', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('list() calls /api/v1/ships', async () => {
    global.fetch = mockFetch(mockShipList);
    const result = await api.ships.list({});
    expect(result).toEqual(mockShipList);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('/api/v1/ships');
  });

  it('list() forwards pagination parameters', async () => {
    global.fetch = mockFetch(mockShipList);
    await api.ships.list({ page: 2, limit: 50, search: 'hornet' });
    const url = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(url).toContain('page=2');
    expect(url).toContain('limit=50');
    expect(url).toContain('search=hornet');
  });

  it('get() calls /api/v1/ships/:uuid', async () => {
    global.fetch = mockFetch(mockShip);
    const result = await api.ships.get('abc');
    expect(result).toEqual(mockShip);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('/api/v1/ships/abc');
  });

  it('throws an error if the response is not ok', async () => {
    global.fetch = mockFetch(null, false, 404);
    await expect(api.ships.get('unknown')).rejects.toThrow('HTTP 404');
  });
});

describe('api.search', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('calls /api/v1/search with the search parameter', async () => {
    global.fetch = mockFetch({ ships: [], components: [] });
    await api.search('aurora');
    const url = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(url).toContain('/api/v1/search');
    expect(url).toContain('search=aurora');
  });
});

describe('api.components', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('list() calls /api/v1/components', async () => {
    global.fetch = mockFetch({ data: [], pagination: {} });
    await api.components.list({});
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('/api/v1/components');
  });

  it('get() calls /api/v1/components/:uuid', async () => {
    global.fetch = mockFetch({ uuid: 'comp-123' });
    await api.components.get('comp-123');
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('/api/v1/components/comp-123');
  });
});

describe('api.changelog', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('summary() calls /api/v1/changelog/summary', async () => {
    global.fetch = mockFetch({});
    await api.changelog.summary();
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('/api/v1/changelog/summary');
  });
});

describe('api.loadout', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('calculate() sends a POST request', async () => {
    global.fetch = mockFetch([]);
    await api.loadout.calculate('ship-uuid', []);
    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect((options as RequestInit).method).toBe('POST');
  });
});
