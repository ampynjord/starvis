import { describe, expect, it, vi } from 'vitest';
import { calculateMiningYield } from '../src/services/calculator/mining.js';

describe('calculator services', () => {
  describe('calculateMiningYield', () => {
    it('keeps mining percentages realistic and scoped to the requested env', async () => {
      const prisma = {
        miningComposition: {
          findFirst: vi.fn().mockResolvedValue({
            uuid: 'comp-1',
            env: 'ptu',
            depositName: 'Agricium (Ore)',
          }),
        },
        miningCompositionPart: {
          findMany: vi.fn().mockResolvedValue([
            {
              elementUuid: 'elem-1',
              probability: 1,
              minPercentage: 10,
              maxPercentage: 20,
              element: {
                name: 'Agricium Ore',
                instability: 700,
                resistance: 0.5,
                optimalWindowMidpoint: 0.5,
              },
            },
            {
              elementUuid: 'elem-2',
              probability: 0.5,
              minPercentage: 5,
              maxPercentage: 15,
              element: {
                name: 'Titanium Ore',
                instability: 0,
                resistance: 0.2,
                optimalWindowMidpoint: 0.6,
              },
            },
          ]),
        },
        component: {
          findFirst: vi.fn().mockResolvedValue({
            uuid: 'laser-1',
            name: 'Arbor MH1',
            size: 1,
            grade: 'A',
            manufacturerCode: 'GRIN',
            miningSpeed: 1,
            miningRange: 120,
            miningResistance: 0,
            miningInstability: 0,
          }),
        },
      };

      const result = await calculateMiningYield(prisma as any, {
        compositionUuid: 'comp-1',
        env: 'ptu',
        laserUuid: 'laser-1',
      });

      expect(prisma.miningComposition.findFirst).toHaveBeenCalledWith({
        where: { uuid: 'comp-1', env: 'ptu' },
      });
      expect(prisma.miningCompositionPart.findMany).toHaveBeenCalledWith({
        where: { compositionUuid: 'comp-1', compositionEnv: 'ptu' },
        include: { element: true },
      });
      expect(prisma.component.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { uuid: 'laser-1', env: 'ptu' } }));
      expect(result?.elements).toHaveLength(2);
      expect(result?.elements[0]).toMatchObject({
        elementName: 'Agricium Ore',
        baseYield: 15,
        optimizedYield: 7.2,
      });
      expect(result?.risk).toMatchObject({
        maxInstability: 0.7,
        maxResistance: 0.5,
      });
    });
  });
});
