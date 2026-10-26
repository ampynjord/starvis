/**
 * Garde-fous A3 : `gameVersion` et `changesOnly` doivent réellement filtrer.
 */
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { GameDataService } from '../src/services/game-data-service.js';

function createMockPrisma(capture: { sql: string[]; params: unknown[][] }): PrismaClient {
  const $queryRawUnsafe = vi.fn(async (sql: string, ...params: unknown[]) => {
    capture.sql.push(sql);
    capture.params.push(params);
    if (/COUNT/i.test(sql)) return [{ total: 0 }];
    return [];
  });
  return { $queryRawUnsafe } as unknown as PrismaClient;
}

describe('GameDataService changelog filters', () => {
  it('filtre par game_version quand gameVersion est fourni', async () => {
    const capture = { sql: [] as string[], params: [] as unknown[][] };
    const prisma = createMockPrisma(capture);
    const service = new GameDataService(() => prisma, prisma);

    await service.getChangelog({ env: 'live', gameVersion: '4.10.2', limit: '10' });

    const countSql = capture.sql[0] ?? '';
    expect(countSql).toMatch(/game_version\s*=\s*\$/);
    expect(capture.params[0]).toEqual(expect.arrayContaining(['live', '4.10.2']));
  });

  it('changesOnly exclut les marqueurs (field_name IS NOT NULL)', async () => {
    const capture = { sql: [] as string[], params: [] as unknown[][] };
    const prisma = createMockPrisma(capture);
    const service = new GameDataService(() => prisma, prisma);

    await service.getVersionChangelog('4.10.2', { env: 'live', changesOnly: true, limit: '10' });

    const countSql = capture.sql[0] ?? '';
    expect(countSql).toMatch(/field_name\s+IS\s+NOT\s+NULL/i);
    expect(countSql).toMatch(/game_version\s*=\s*\$/);
    expect(capture.params[0]).toEqual(expect.arrayContaining(['live', '4.10.2']));
  });

  it('sans changesOnly ni markersOnly, ne filtre pas field_name', async () => {
    const capture = { sql: [] as string[], params: [] as unknown[][] };
    const prisma = createMockPrisma(capture);
    const service = new GameDataService(() => prisma, prisma);

    await service.getVersionChangelog('4.9.0', { env: 'live', limit: '5' });

    const countSql = capture.sql[0] ?? '';
    expect(countSql).not.toMatch(/field_name/i);
  });
});
