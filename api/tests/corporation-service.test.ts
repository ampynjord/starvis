import { describe, expect, it, vi } from 'vitest';
import { CorporationService } from '../src/services/corporation-service.js';

const corporation = {
  id: 42,
  name: 'Dawnstar',
  tag: 'DNR',
  description: null,
  logoUrl: null,
  rsiArchetype: null,
  rsiLanguage: null,
  rsiCommitment: null,
  rsiRecruiting: null,
  rsiRoleplay: null,
  rsiMemberCount: null,
  rsiSyncedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  _count: { memberships: 2, fleetItems: 3 },
};

describe('CorporationService', () => {
  describe('getFleetItems', () => {
    it('can fetch a personal fleet when the user has no corporation', async () => {
      const db: any = {
        corporationFleetItem: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      };

      await new CorporationService(db).getFleetItems(null, 'ship', 7);

      expect(db.corporationFleetItem.findMany).toHaveBeenCalledWith({
        where: { corporationId: null, addedById: 7, itemType: 'ship' },
        select: expect.any(Object),
        orderBy: [{ addedAt: 'desc' }],
      });
    });
  });

  describe('declareShip', () => {
    it('can declare a personal ship without a corporation', async () => {
      const db: any = {
        corporationFleetItem: {
          create: vi.fn().mockResolvedValue({ id: 1 }),
        },
      };

      await new CorporationService(db).declareShip(7, null, {
        shipUuid: 'concept-123',
        itemClassName: 'concept_ship',
      });

      expect(db.corporationFleetItem.create).toHaveBeenCalledWith({
        data: {
          corporationId: null,
          itemType: 'ship',
          itemClassName: 'concept_ship',
          shipUuid: 'concept-123',
          quantity: 1,
          notes: null,
          addedById: 7,
        },
        select: expect.any(Object),
      });
    });
  });

  describe('syncRsiHangarFleet', () => {
    it('mirrors RSI hangar ships by source id without touching manual fleet entries', async () => {
      const upserts: any[] = [];
      const db: any = {
        $queryRawUnsafe: vi.fn().mockResolvedValue([{ uuid: 'ship-uuid-1', class_name: 'AEGS_Gladius', name: 'Gladius' }]),
        $transaction: vi.fn((run) => run(db)),
        corporationFleetItem: {
          findMany: vi
            .fn()
            .mockResolvedValueOnce([
              { id: 10, gridX: 0, gridZ: 0, source: 'rsi_hangar', sourceExternalId: 'pledge-1' },
              { id: 11, gridX: 36, gridZ: 0, source: 'rsi_hangar', sourceExternalId: 'stale-pledge' },
            ])
            .mockResolvedValueOnce([{ id: 10, itemClassName: 'AEGS_Gladius', shipUuid: 'ship-uuid-1' }]),
          upsert: vi.fn((args) => {
            upserts.push(args);
            return Promise.resolve({ id: 10 });
          }),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      const result = await new CorporationService(db).syncRsiHangarFleet(7, null, [
        { externalId: 'pledge-1', className: 'AEGS_Gladius', name: 'Gladius' },
        { externalId: 'pledge-2', className: 'AEGS_Gladius', name: 'Gladius' },
      ]);

      expect(result.imported).toBe(1);
      expect(result.updated).toBe(1);
      expect(result.removed).toBe(1);
      expect(upserts).toHaveLength(2);
      expect(upserts[0].where).toEqual({
        addedById_source_sourceExternalId: {
          addedById: 7,
          source: 'rsi_hangar',
          sourceExternalId: 'pledge-1',
        },
      });
      expect(db.corporationFleetItem.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [11] } } });
    });

    it('does not import RSI hangar entries that do not match a known ship', async () => {
      const db: any = {
        $queryRawUnsafe: vi.fn().mockResolvedValue([]),
        $transaction: vi.fn((run) => run(db)),
        corporationFleetItem: {
          findMany: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
          upsert: vi.fn(),
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };

      const result = await new CorporationService(db).syncRsiHangarFleet(7, null, [
        { externalId: 'paint-1', name: 'Paints - Tiburon - Vermillion Paint' },
      ]);

      expect(result.imported).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.unmatched).toEqual([{ externalId: 'paint-1', label: 'Paints - Tiburon - Vermillion Paint' }]);
      expect(db.corporationFleetItem.upsert).not.toHaveBeenCalled();
    });

    it('assigns a side-by-side position to new RSI ships', async () => {
      const upserts: any[] = [];
      const db: any = {
        $queryRawUnsafe: vi.fn().mockResolvedValue([{ uuid: 'ship-uuid-1', class_name: 'AEGS_Gladius', name: 'Gladius' }]),
        $transaction: vi.fn((run) => run(db)),
        corporationFleetItem: {
          findMany: vi
            .fn()
            .mockResolvedValueOnce([{ id: 9, gridX: 72, gridZ: 0, source: null, sourceExternalId: null }])
            .mockResolvedValueOnce([]),
          upsert: vi.fn((args) => {
            upserts.push(args);
            return Promise.resolve({ id: 10 });
          }),
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };

      await new CorporationService(db).syncRsiHangarFleet(7, null, [
        { externalId: 'pledge-1', className: 'AEGS_Gladius', name: 'Gladius' },
      ]);

      expect(upserts[0].create).toMatchObject({ gridX: 108, gridZ: 0 });
      expect(upserts[0].update).toMatchObject({ gridX: 108, gridZ: 0 });
    });
  });

  describe('updateOwnFleetItemPosition', () => {
    it('persists a user fleet item position', async () => {
      const db: any = {
        corporationFleetItem: {
          findUnique: vi.fn().mockResolvedValue({ id: 11, addedById: 7 }),
          update: vi.fn().mockResolvedValue({ id: 11, gridX: 12, gridZ: -4 }),
        },
      };

      const result = await new CorporationService(db).updateOwnFleetItemPosition(11, 7, { gridX: 12, gridZ: -4 });

      expect(result).toEqual({ id: 11, gridX: 12, gridZ: -4 });
      expect(db.corporationFleetItem.update).toHaveBeenCalledWith({
        where: { id: 11 },
        data: { gridX: 12, gridZ: -4 },
        select: expect.any(Object),
      });
    });

    it('rejects moving another user fleet item', async () => {
      const db: any = {
        corporationFleetItem: {
          findUnique: vi.fn().mockResolvedValue({ id: 11, addedById: 8 }),
          update: vi.fn(),
        },
      };

      await expect(new CorporationService(db).updateOwnFleetItemPosition(11, 7, { gridX: 1, gridZ: 2 })).rejects.toThrow('FORBIDDEN');
      expect(db.corporationFleetItem.update).not.toHaveBeenCalled();
    });

    it('allows moving another member fleet item in the same corporation', async () => {
      const db: any = {
        corporationFleetItem: {
          findUnique: vi.fn().mockResolvedValue({ id: 11, addedById: 8, corporationId: 42 }),
          update: vi.fn().mockResolvedValue({ id: 11, gridX: 1, gridZ: 2 }),
        },
      };

      await new CorporationService(db).updateOwnFleetItemPosition(11, 7, { gridX: 1, gridZ: 2 }, 42);

      expect(db.corporationFleetItem.update).toHaveBeenCalledWith({
        where: { id: 11 },
        data: { gridX: 1, gridZ: 2 },
        select: expect.any(Object),
      });
    });
  });

  describe('updateOwnFleetItemAvailability', () => {
    it('lets the ship owner make a corporation ship available for tactics', async () => {
      const db: any = {
        corporationFleetItem: {
          findUnique: vi.fn().mockResolvedValue({ id: 11, addedById: 7, corporationId: 42, itemType: 'ship' }),
          update: vi.fn().mockResolvedValue({ id: 11, availableForTactics: true }),
        },
      };

      const result = await new CorporationService(db).updateOwnFleetItemAvailability(11, 7, true);

      expect(result).toEqual({ id: 11, availableForTactics: true });
      expect(db.corporationFleetItem.update).toHaveBeenCalledWith({
        where: { id: 11 },
        data: { availableForTactics: true },
        select: expect.any(Object),
      });
    });

    it('rejects availability changes from another member', async () => {
      const db: any = {
        corporationFleetItem: {
          findUnique: vi.fn().mockResolvedValue({ id: 11, addedById: 8, corporationId: 42, itemType: 'ship' }),
          update: vi.fn(),
        },
      };

      await expect(new CorporationService(db).updateOwnFleetItemAvailability(11, 7, true)).rejects.toThrow('FORBIDDEN');
      expect(db.corporationFleetItem.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteCorporation', () => {
    it('deletes the corporation and only removes corporation-scoped fleet data', async () => {
      const db: any = {
        corporation: {
          findUnique: vi.fn().mockResolvedValueOnce(corporation),
          delete: vi.fn().mockResolvedValue(corporation),
        },
        corporationFleetItem: {
          deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
        },
        corporationMembership: {
          deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
        user: {
          delete: vi.fn(),
          deleteMany: vi.fn(),
        },
        $transaction: vi.fn((run) => run(db)),
      };

      const result = await new CorporationService(db).deleteCorporation(42);

      expect(db.corporationMembership.deleteMany).toHaveBeenCalledWith({ where: { corporationId: 42 } });
      expect(db.corporationFleetItem.deleteMany).toHaveBeenCalledWith({ where: { corporationId: 42 } });
      expect(db.corporation.delete).toHaveBeenCalledWith({ where: { id: 42 } });
      expect(db.user.delete).not.toHaveBeenCalled();
      expect(db.user.deleteMany).not.toHaveBeenCalled();
      expect(result).toEqual({
        corporation: {
          ...corporation,
          _count: { memberships: 0, fleetItems: 0, bankItems: 0, pendingMemberships: 0 },
        },
        removedMemberships: 2,
        removedFleetItems: 3,
        deleted: true,
      });
    });
  });
});
