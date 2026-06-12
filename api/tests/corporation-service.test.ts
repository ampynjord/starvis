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

  describe('deleteCorporation', () => {
    it('resets Starvis-owned corporation data without deleting the corporation or users', async () => {
      const resetCorporation = {
        ...corporation,
        _count: { memberships: 0, fleetItems: 0 },
      };
      const db: any = {
        corporation: {
          findUnique: vi.fn().mockResolvedValueOnce(corporation).mockResolvedValueOnce(resetCorporation),
          delete: vi.fn(),
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
      expect(db.corporation.delete).not.toHaveBeenCalled();
      expect(db.user.delete).not.toHaveBeenCalled();
      expect(db.user.deleteMany).not.toHaveBeenCalled();
      expect(result).toEqual({
        corporation: {
          ...resetCorporation,
          _count: { memberships: 0, fleetItems: 0, bankItems: 0, pendingMemberships: 0 },
        },
        removedMemberships: 2,
        removedFleetItems: 3,
      });
    });
  });
});
