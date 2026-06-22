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
});
