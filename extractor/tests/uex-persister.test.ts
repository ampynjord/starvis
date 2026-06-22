import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveUexMarket } from '../src/persisters/uex.js';

type QueryCall = { sql: string; params?: unknown[] };

function makeResponse(data: unknown[]) {
  return {
    ok: true,
    json: async () => ({ status: 'ok', data }),
  } as Response;
}

describe('saveUexMarket', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps UEX item_uuid to the Starvis DataForge item UUID before falling back to names', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/items_prices_all')) {
        return makeResponse([
          {
            id: 725,
            id_item: 564,
            id_terminal: 113,
            item_name: 'ReadyMeal (Vegetarian)',
            item_uuid: 'd9290fb6-3b8a-45bd-ac1e-c6f41d182951',
            terminal_name: 'Cubby Area 18',
            price_buy: 18,
            price_sell: 0,
            date_modified: 1781069845,
          },
        ]);
      }
      return makeResponse([]);
    });

    const calls: QueryCall[] = [];
    const conn = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        if (sql.includes('FROM game.items')) {
          return {
            rows: [
              {
                uuid: '3b8a45bd-0fb6-d929-5129-181df4c61eac',
                name: 'P4K name intentionally different',
              },
            ],
          };
        }
        if (sql.includes('FROM game.ships') || sql.includes('FROM game.commodities') || sql.includes('FROM game.components')) {
          return { rows: [] };
        }
        if (sql.includes('WITH market AS')) {
          return { rows: [{ ships: '0', purchasable: '0', rentable: '0', no_terminal_offer: '0' }] };
        }
        return { rows: [], rowCount: 1 };
      }),
    };

    await saveUexMarket(conn as never, 'live');

    const marketInsert = calls.find((call) => call.sql.includes('INSERT INTO game.uex_market_prices'));
    expect(marketInsert?.params).toBeDefined();
    expect(marketInsert?.params?.[5]).toBe('3b8a45bd-0fb6-d929-5129-181df4c61eac');
  });

  it('maps common UEX vehicle naming variants without mapping ambiguous names', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/vehicles')) {
        return makeResponse([
          { id: 1, name: 'Aurora Mk I CL', name_full: 'Aurora Mk I CL', uuid: null },
          { id: 2, name: 'A2 Hercules Starlifter', name_full: 'A2 Hercules Starlifter', uuid: null },
          { id: 3, name: 'San tok.Yāi', name_full: 'San tok.Yāi', uuid: null },
          { id: 4, name: 'MPUV Tractor', name_full: 'MPUV Tractor', uuid: null },
          { id: 5, name: 'CSV-SM', name_full: 'CSV-SM', uuid: null },
        ]);
      }
      if (url.includes('/terminals?type=vehicle_')) {
        return makeResponse([{ id: 100, type: 'vehicle_buy', name: 'Astro Armada', is_available: 1 }]);
      }
      if (url.endsWith('/vehicles_purchases_prices_all')) {
        return makeResponse([
          { id: 11, id_vehicle: 1, id_terminal: 100, price_buy: 1, vehicle_name: 'Aurora Mk I CL' },
          { id: 12, id_vehicle: 2, id_terminal: 100, price_buy: 2, vehicle_name: 'A2 Hercules Starlifter' },
          { id: 13, id_vehicle: 3, id_terminal: 100, price_buy: 3, vehicle_name: 'San tok.Yāi' },
          { id: 14, id_vehicle: 4, id_terminal: 100, price_buy: 4, vehicle_name: 'MPUV Tractor' },
          { id: 15, id_vehicle: 5, id_terminal: 100, price_buy: 5, vehicle_name: 'CSV-SM' },
        ]);
      }
      return makeResponse([]);
    });

    const calls: QueryCall[] = [];
    const conn = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        if (sql.includes('FROM game.ships')) {
          return {
            rows: [
              { uuid: 'ship-aurora-cl', name: 'Aurora GS CL' },
              { uuid: 'ship-starlifter-a2', name: 'Starlifter A2' },
              { uuid: 'ship-santokyai', name: 'SanTokYai' },
              { uuid: 'ship-mpuv-1t', name: 'MPUV 1T' },
            ],
          };
        }
        if (sql.includes('FROM game.items') || sql.includes('FROM game.commodities') || sql.includes('FROM game.components')) {
          return { rows: [] };
        }
        if (sql.includes('WITH market AS')) {
          return { rows: [{ ships: '0', purchasable: '0', rentable: '0', no_terminal_offer: '0' }] };
        }
        return { rows: [], rowCount: 1 };
      }),
    };

    await saveUexMarket(conn as never, 'live');

    const vehicleInsert = calls.find((call) => call.sql.includes('INSERT INTO game.uex_vehicle_prices'));
    expect(vehicleInsert?.params).toBeDefined();
    const rows = new Map<unknown, unknown>();
    for (let index = 0; index < (vehicleInsert?.params?.length ?? 0); index += 12) {
      rows.set(vehicleInsert?.params?.[index + 3], vehicleInsert?.params?.[index + 4]);
    }

    expect(rows.get(1)).toBe('ship-aurora-cl');
    expect(rows.get(2)).toBe('ship-starlifter-a2');
    expect(rows.get(3)).toBe('ship-santokyai');
    expect(rows.get(4)).toBe('ship-mpuv-1t');
    expect(rows.get(5)).toBeNull();
  });
});
