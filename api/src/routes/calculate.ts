import type { Router } from 'express';
import { z } from 'zod';
import { calculateFpsDamage } from '../services/calculator/fps.js';
import { calculateMiningYield } from '../services/calculator/mining.js';
import { asyncHandler } from './helpers.js';
import type { RouteDependencies } from './types.js';

const FpsDamageBody = z.object({
  itemUuid: z.string().min(1, 'itemUuid is required'),
  env: z.enum(['live', 'ptu', 'eptu', 'custom']).optional(),
  fireMode: z.enum(['Single', 'Burst', 'Auto']).optional(),
  hitbox: z.enum(['head', 'torso', 'arm', 'leg']).optional(),
  armorClass: z.enum(['none', 'light', 'medium', 'heavy']).optional(),
  health: z.number().min(1).max(10000).optional(),
  barrelRateBonus: z.number().min(0).max(100).optional(),
  underbarrelDamageBonus: z.number().min(0).max(100).optional(),
  craftedMitigationBonus: z.number().min(0).max(100).optional(),
});

const MiningYieldBody = z.object({
  compositionUuid: z.string().min(1, 'compositionUuid is required'),
  env: z.enum(['live', 'ptu', 'eptu', 'custom']).optional(),
  laserUuid: z.string().optional(),
  gadgetUuids: z.array(z.string()).max(3).optional(),
});

export function mountCalculateRoutes(router: Router, deps: RouteDependencies): void {
  const { prisma } = deps;

  router.post(
    '/api/v1/calculate/fps-damage',
    asyncHandler(async (req, res) => {
      const input = FpsDamageBody.parse(req.body);
      const result = await calculateFpsDamage(prisma, input);
      if (!result) return void res.status(404).json({ success: false, error: 'Item not found' });
      res.json({ success: true, data: result });
    }),
  );

  router.post(
    '/api/v1/calculate/mining-yield',
    asyncHandler(async (req, res) => {
      const input = MiningYieldBody.parse(req.body);
      const result = await calculateMiningYield(prisma, input);
      if (!result) return void res.status(404).json({ success: false, error: 'Composition not found' });
      res.json({ success: true, data: result });
    }),
  );
}
