import { describe, expect, it } from 'vitest';
import { crossReferenceStarmapLocations } from '../src/crossref.js';

describe('crossReferenceStarmapLocations', () => {
  it('links P4K locations to matching RSI starmap records', async () => {
    const updates: Array<{ rsiId: number; uuid: string; env: string }> = [];
    const conn = {
      async query(sql: string, params?: unknown[]) {
        if (sql.startsWith('UPDATE game.locations SET rsi_starmap_location_id = NULL')) {
          return { rowCount: 2, rows: [] };
        }
        if (sql.startsWith('SELECT uuid, class_name, name, type, system_code FROM game.locations')) {
          return {
            rows: [
              { uuid: 'system-uuid', name: 'Stanton', type: 'system', system_code: 'STANTON' },
              { uuid: 'planet-uuid', name: 'Hurston', type: 'planet', system_code: 'STANTON' },
            ],
          };
        }
        if (sql.startsWith('SELECT id, name, type, system_code, system_name FROM rsi.starmap_locations')) {
          return {
            rows: [
              { id: 10, name: 'Stanton', type: 'star', system_code: 'STANTON', system_name: 'Stanton' },
              { id: 20, name: 'Hurston', type: 'planet', system_code: 'STANTON', system_name: 'Stanton' },
            ],
          };
        }
        if (sql.startsWith('UPDATE game.locations SET rsi_starmap_location_id = $1')) {
          updates.push({ rsiId: params?.[0] as number, uuid: params?.[1] as string, env: params?.[2] as string });
          return { rowCount: 1, rows: [] };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    };

    const linked = await crossReferenceStarmapLocations(conn as never, 'live');

    expect(linked).toBe(2);
    expect(updates).toEqual([
      { rsiId: 10, uuid: 'system-uuid', env: 'live' },
      { rsiId: 20, uuid: 'planet-uuid', env: 'live' },
    ]);
  });
});
