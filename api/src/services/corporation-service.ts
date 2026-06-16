import type { PrismaLike } from '@starvis/db';
import type { RsiOrg } from './rsi-orgs-service.js';
import { toPostgres } from './shared.js';

export interface CorporationData {
  id: number;
  name: string;
  tag: string;
  description: string | null;
  logoUrl: string | null;
  rsiArchetype: string | null;
  rsiLanguage: string | null;
  rsiCommitment: string | null;
  rsiRecruiting: boolean | null;
  rsiRoleplay: boolean | null;
  rsiMemberCount: number | null;
  rsiSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { memberships: number; fleetItems: number; bankItems?: number; pendingMemberships?: number };
}

export interface CorporationDeleteResult {
  corporation: CorporationData;
  removedMemberships: number;
  removedFleetItems: number;
  deleted: true;
}

export interface MembershipData {
  id: number;
  userId: number;
  corporationId: number;
  rank: string | null;
  role: 'member' | 'leader';
  status: 'pending' | 'active' | 'rejected';
  reviewedById: number | null;
  reviewedAt: Date | null;
  declaredAt: Date;
  user: { id: number; username: string; email: string; avatarUrl: string | null };
  corporation?: { id: number; name: string; tag: string };
}

export interface FleetItemData {
  id: number;
  corporationId: number | null;
  itemType: string;
  itemClassName: string;
  itemName?: string | null;
  shipUuid?: string | null;
  quantity: number;
  notes: string | null;
  availableForTactics: boolean;
  addedById: number | null;
  addedAt: Date;
  updatedAt: Date;
  addedBy?: { id: number; username: string } | null;
  corporation?: { id: number; name: string; tag: string } | null;
}

const CORP_SELECT = {
  id: true,
  name: true,
  tag: true,
  description: true,
  logoUrl: true,
  rsiArchetype: true,
  rsiLanguage: true,
  rsiCommitment: true,
  rsiRecruiting: true,
  rsiRoleplay: true,
  rsiMemberCount: true,
  rsiSyncedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { memberships: true, fleetItems: true } },
};

const MEMBERSHIP_SELECT = {
  id: true,
  userId: true,
  corporationId: true,
  rank: true,
  role: true,
  status: true,
  reviewedById: true,
  reviewedAt: true,
  declaredAt: true,
  user: { select: { id: true, username: true, email: true, avatarUrl: true } },
  corporation: { select: { id: true, name: true, tag: true } },
};

const FLEET_SELECT = {
  id: true,
  corporationId: true,
  itemType: true,
  itemClassName: true,
  quantity: true,
  notes: true,
  gridX: true,
  gridZ: true,
  availableForTactics: true,
  addedById: true,
  addedAt: true,
  updatedAt: true,
  addedBy: { select: { id: true, username: true } },
};

export class CorporationService {
  constructor(private readonly prisma: PrismaLike) {}

  private get db(): any {
    return this.prisma as any;
  }

  private async withFleetItemNames(items: FleetItemData[], env = 'live'): Promise<FleetItemData[]> {
    if (!items.length) return items;
    const keys = [...new Set(items.map((item) => item.itemClassName).filter(Boolean))];
    if (!keys.length) return items;
    const placeholders = keys.map(() => '?').join(',');
    const rows = (await this.db.$queryRawUnsafe(
      toPostgres(`
        SELECT class_name, name
        FROM game.ships
        WHERE env = ? AND class_name IN (${placeholders})
        UNION ALL
        SELECT class_name, name
        FROM game.components
        WHERE env = ? AND class_name IN (${placeholders})
        UNION ALL
        SELECT class_name, COALESCE(name, class_name) AS name
        FROM game.items
        WHERE env = ? AND class_name IN (${placeholders})
        UNION ALL
        SELECT class_name, name
        FROM game.commodities
        WHERE env = ? AND class_name IN (${placeholders})
      `),
      env,
      ...keys,
      env,
      ...keys,
      env,
      ...keys,
      env,
      ...keys,
    )) as Array<{ class_name: string; name: string | null }>;
    const nameByClass = new Map<string, string | null>(rows.map((row) => [String(row.class_name), row.name]));
    return items.map((item) => ({ ...item, itemName: nameByClass.get(item.itemClassName) ?? null }));
  }

  // ── Corporations ────────────────────────────────────────────────────────────

  async listCorporations(): Promise<CorporationData[]> {
    const corps = await this.db.corporation.findMany({
      select: CORP_SELECT,
      orderBy: { rsiMemberCount: 'desc' },
    });
    return this.withCorporationCounts(corps);
  }

  async getCorporation(id: number): Promise<CorporationData | null> {
    const corp = await this.db.corporation.findUnique({ where: { id }, select: CORP_SELECT });
    if (!corp) return null;
    return (await this.withCorporationCounts([corp]))[0] ?? null;
  }

  async getCorporationByTag(tag: string): Promise<CorporationData | null> {
    return this.db.corporation.findUnique({
      where: { tag: tag.toUpperCase() },
      select: CORP_SELECT,
    });
  }

  // Upsert a corporation from RSI org data (auto-creates or updates)
  async upsertFromRsi(org: RsiOrg): Promise<CorporationData> {
    const tag = org.symbol.toUpperCase();
    return this.db.corporation.upsert({
      where: { tag },
      create: {
        name: org.name,
        tag,
        logoUrl: org.logoUrl,
        rsiArchetype: org.archetype,
        rsiLanguage: org.language,
        rsiCommitment: org.commitment,
        rsiRecruiting: org.recruiting,
        rsiRoleplay: org.roleplay,
        rsiMemberCount: org.memberCount,
        rsiSyncedAt: new Date(),
      },
      update: {
        name: org.name,
        logoUrl: org.logoUrl,
        rsiArchetype: org.archetype,
        rsiLanguage: org.language,
        rsiCommitment: org.commitment,
        rsiRecruiting: org.recruiting,
        rsiRoleplay: org.roleplay,
        rsiMemberCount: org.memberCount,
        rsiSyncedAt: new Date(),
      },
      select: CORP_SELECT,
    });
  }

  async deleteCorporation(id: number): Promise<CorporationDeleteResult> {
    const run = async (tx: any): Promise<CorporationDeleteResult> => {
      const corp = await tx.corporation.findUnique({ where: { id }, select: CORP_SELECT });
      if (!corp) {
        const err = new Error('CORP_NOT_FOUND') as Error & { code?: string };
        err.code = 'P2025';
        throw err;
      }

      const [fleetResult, membershipResult] = await Promise.all([
        tx.corporationFleetItem.deleteMany({ where: { corporationId: id } }),
        tx.corporationMembership.deleteMany({ where: { corporationId: id } }),
      ]);

      await tx.corporation.delete({ where: { id } });

      return {
        corporation: {
          ...corp,
          _count: {
            memberships: 0,
            fleetItems: 0,
            bankItems: 0,
            pendingMemberships: 0,
          },
        },
        removedMemberships: Number(membershipResult.count ?? 0),
        removedFleetItems: Number(fleetResult.count ?? 0),
        deleted: true,
      };
    };

    if (typeof this.db.$transaction === 'function') {
      return this.db.$transaction(run);
    }
    return run(this.db);
  }

  async createCorporation(data: {
    name: string;
    tag?: string | null;
    description?: string | null;
    logoUrl?: string | null;
  }): Promise<CorporationData> {
    const corp = await this.db.corporation.create({
      data: {
        name: data.name.trim(),
        tag: (data.tag?.trim() || data.name.trim().slice(0, 10)).toUpperCase(),
        description: data.description?.trim() || null,
        logoUrl: data.logoUrl?.trim() || null,
      },
      select: CORP_SELECT,
    });
    return (await this.withCorporationCounts([corp]))[0];
  }

  async updateCorporation(
    id: number,
    data: { name?: string; tag?: string | null; description?: string | null; logoUrl?: string | null },
  ): Promise<CorporationData> {
    const corp = await this.db.corporation.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.tag !== undefined ? { tag: (data.tag?.trim() || '').toUpperCase() || undefined } : {}),
        ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}),
        ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl?.trim() || null } : {}),
      },
      select: CORP_SELECT,
    });
    return (await this.withCorporationCounts([corp]))[0];
  }

  private async withCorporationCounts(corps: CorporationData[]): Promise<CorporationData[]> {
    if (!corps.length) return corps;
    const ids = corps.map((c) => c.id);
    const [bankCounts, pendingCounts] = await Promise.all([
      this.db.corporationFleetItem.groupBy({
        by: ['corporationId'],
        where: { corporationId: { in: ids }, itemType: { not: 'ship' } },
        _count: { _all: true },
      }),
      this.db.corporationMembership.groupBy({
        by: ['corporationId'],
        where: { corporationId: { in: ids }, status: 'pending' },
        _count: { _all: true },
      }),
    ]);
    const bankByCorp = new Map<number, number>(bankCounts.map((row: any) => [Number(row.corporationId), Number(row._count._all)]));
    const pendingByCorp = new Map<number, number>(pendingCounts.map((row: any) => [Number(row.corporationId), Number(row._count._all)]));
    return corps.map((corp) => ({
      ...corp,
      _count: {
        memberships: corp._count?.memberships ?? 0,
        fleetItems: corp._count?.fleetItems ?? 0,
        bankItems: bankByCorp.get(corp.id) ?? 0,
        pendingMemberships: pendingByCorp.get(corp.id) ?? 0,
      },
    }));
  }

  // ── Membership — instant declaration, no pending ─────────────────────────────

  async getMyMembership(userId: number): Promise<MembershipData | null> {
    return this.db.corporationMembership.findFirst({
      where: { userId },
      orderBy: { declaredAt: 'desc' },
      select: MEMBERSHIP_SELECT,
    });
  }

  async getMyActiveMembership(userId: number): Promise<MembershipData | null> {
    return this.db.corporationMembership.findFirst({
      where: { userId, status: 'active' },
      select: MEMBERSHIP_SELECT,
    });
  }

  async getUserMembership(userId: number): Promise<MembershipData | null> {
    return this.db.corporationMembership.findFirst({
      where: { userId },
      select: MEMBERSHIP_SELECT,
    });
  }

  async requestOrgMembership(userId: number, org: RsiOrg): Promise<MembershipData> {
    const corp = await this.upsertFromRsi(org);
    await this.db.corporationMembership.deleteMany({ where: { userId } });
    return this.db.corporationMembership.create({
      data: { userId, corporationId: corp.id, status: 'pending', role: 'member' },
      select: MEMBERSHIP_SELECT,
    });
  }

  // Backward-compatible name: user declarations are now approval requests.
  async declareOrgMembership(userId: number, org: RsiOrg): Promise<MembershipData> {
    return this.requestOrgMembership(userId, org);
  }

  async leaveOrg(userId: number): Promise<void> {
    await this.db.corporationMembership.deleteMany({ where: { userId } });
  }

  // ── Members management ───────────────────────────────────────────────────────

  async listMembers(corporationId: number): Promise<MembershipData[]> {
    return this.db.corporationMembership.findMany({
      where: { corporationId, status: 'active' },
      select: MEMBERSHIP_SELECT,
      orderBy: [{ role: 'desc' }, { declaredAt: 'desc' }],
    });
  }

  async listPendingMemberships(corporationId?: number): Promise<MembershipData[]> {
    return this.db.corporationMembership.findMany({
      where: { status: 'pending', ...(corporationId ? { corporationId } : {}) },
      select: MEMBERSHIP_SELECT,
      orderBy: { declaredAt: 'asc' },
    });
  }

  async isCorporationLeader(userId: number, corporationId: number): Promise<boolean> {
    const membership = await this.db.corporationMembership.findFirst({
      where: { userId, corporationId, status: 'active', role: 'leader' },
      select: { id: true },
    });
    return !!membership;
  }

  async getMembership(membershipId: number): Promise<MembershipData | null> {
    return this.db.corporationMembership.findUnique({
      where: { id: membershipId },
      select: MEMBERSHIP_SELECT,
    });
  }

  async approveMembership(membershipId: number, reviewerId: number, role: 'member' | 'leader' = 'member'): Promise<MembershipData> {
    const membership = await this.db.corporationMembership.findUnique({
      where: { id: membershipId },
      select: { id: true, userId: true },
    });
    if (!membership) throw new Error('NOT_FOUND');
    await this.db.corporationMembership.deleteMany({ where: { userId: membership.userId, id: { not: membershipId } } });
    return this.db.corporationMembership.update({
      where: { id: membershipId },
      data: { status: 'active', role, reviewedById: reviewerId, reviewedAt: new Date() },
      select: MEMBERSHIP_SELECT,
    });
  }

  async rejectMembership(membershipId: number, reviewerId: number): Promise<MembershipData> {
    return this.db.corporationMembership.update({
      where: { id: membershipId },
      data: { status: 'rejected', reviewedById: reviewerId, reviewedAt: new Date() },
      select: MEMBERSHIP_SELECT,
    });
  }

  async updateMembershipRole(membershipId: number, role: 'member' | 'leader'): Promise<MembershipData> {
    return this.db.corporationMembership.update({
      where: { id: membershipId },
      data: { role },
      select: MEMBERSHIP_SELECT,
    });
  }

  async removeMembership(membershipId: number): Promise<void> {
    await this.db.corporationMembership.delete({ where: { id: membershipId } });
  }

  // Admin: add a user to a corp directly
  async adminAddMember(corporationId: number, userId: number): Promise<MembershipData> {
    const corp = await this.db.corporation.findUnique({ where: { id: corporationId } });
    if (!corp) throw new Error('CORP_NOT_FOUND');
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('USER_NOT_FOUND');
    await this.db.corporationMembership.deleteMany({ where: { userId } });
    return this.db.corporationMembership.create({
      data: { userId, corporationId, status: 'active', role: 'member', reviewedAt: new Date() },
      select: MEMBERSHIP_SELECT,
    });
  }

  // Admin: set user's corp (from RSI org data)
  async adminSetUserCorporation(userId: number, org: RsiOrg): Promise<MembershipData> {
    return this.declareOrgMembership(userId, org);
  }

  async adminRemoveUserFromCorporation(userId: number): Promise<void> {
    await this.db.corporationMembership.deleteMany({ where: { userId } });
  }

  // ── Fleet ────────────────────────────────────────────────────────────────────

  async getFleet(corporationId: number): Promise<FleetItemData[]> {
    const items = await this.db.corporationFleetItem.findMany({
      where: { corporationId },
      select: FLEET_SELECT,
      orderBy: [{ itemType: 'asc' }, { itemClassName: 'asc' }],
    });
    return this.withFleetItemNames(items);
  }

  async getFleetItemsByUser(userId: number): Promise<FleetItemData[]> {
    const items = await this.db.corporationFleetItem.findMany({
      where: { addedById: userId },
      select: {
        ...FLEET_SELECT,
        shipUuid: true,
        corporation: { select: { id: true, name: true, tag: true } },
      },
      orderBy: [{ itemType: 'asc' }, { addedAt: 'desc' }],
    });
    return this.withFleetItemNames(items);
  }

  async addFleetItem(
    corporationId: number,
    data: { itemType: string; itemClassName: string; quantity?: number; notes?: string },
    addedById?: number,
  ): Promise<FleetItemData> {
    const corp = await this.db.corporation.findUnique({ where: { id: corporationId } });
    if (!corp) throw new Error('CORP_NOT_FOUND');
    return this.db.corporationFleetItem.create({
      data: {
        corporationId,
        itemType: data.itemType,
        itemClassName: data.itemClassName.trim(),
        quantity: data.quantity ?? 1,
        notes: data.notes?.trim() || null,
        addedById: addedById ?? null,
      },
      select: FLEET_SELECT,
    });
  }

  async updateFleetItem(
    itemId: number,
    data: { itemType?: string; itemClassName?: string; quantity?: number; notes?: string | null; availableForTactics?: boolean },
  ): Promise<FleetItemData> {
    return this.db.corporationFleetItem.update({
      where: { id: itemId },
      data: {
        ...(data.itemType !== undefined ? { itemType: data.itemType } : {}),
        ...(data.itemClassName !== undefined ? { itemClassName: data.itemClassName.trim() } : {}),
        ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.availableForTactics !== undefined ? { availableForTactics: data.availableForTactics } : {}),
      },
      select: FLEET_SELECT,
    });
  }

  async deleteFleetItem(itemId: number): Promise<void> {
    await this.db.corporationFleetItem.delete({ where: { id: itemId } });
  }

  async updateCorporationFleetItem(
    itemId: number,
    corporationId: number,
    userId: number,
    canManage: boolean,
    data: { itemType?: string; itemClassName?: string; quantity?: number; notes?: string | null },
  ): Promise<FleetItemData> {
    const item = await this.db.corporationFleetItem.findUnique({ where: { id: itemId } });
    if (!item) throw new Error('NOT_FOUND');
    if (item.corporationId !== corporationId) throw new Error('FORBIDDEN');
    if (!canManage && item.addedById !== userId) throw new Error('FORBIDDEN');
    return this.updateFleetItem(itemId, data);
  }

  async removeCorporationFleetItem(itemId: number, corporationId: number, userId: number, canManage: boolean): Promise<void> {
    const item = await this.db.corporationFleetItem.findUnique({ where: { id: itemId } });
    if (!item) throw new Error('NOT_FOUND');
    if (item.corporationId !== corporationId) throw new Error('FORBIDDEN');
    if (!canManage && item.addedById !== userId) throw new Error('FORBIDDEN');
    await this.db.corporationFleetItem.delete({ where: { id: itemId } });
  }

  // ── User-facing fleet (ships only) ──────────────────────────────────────────

  async getFleetItems(corporationId: number | null, type: 'ship' | 'non-ship', userId?: number): Promise<FleetItemData[]> {
    // In corp mode: include both corp items AND personal items the user declared before joining
    // so that ships declared without a corp don't vanish after the user joins one.
    const ownerWhere =
      corporationId == null
        ? { corporationId: null, addedById: userId }
        : userId != null
          ? { OR: [{ corporationId }, { corporationId: null, addedById: userId }] }
          : { corporationId };
    const typeFilter = type === 'ship' ? { itemType: 'ship' } : { itemType: { not: 'ship' as const } };
    const where = { ...ownerWhere, ...typeFilter };
    const items = await this.db.corporationFleetItem.findMany({
      where,
      select: { ...FLEET_SELECT, shipUuid: true } as typeof FLEET_SELECT,
      orderBy: [{ addedAt: 'desc' }],
    });
    return this.withFleetItemNames(items);
  }

  async declareShip(
    userId: number,
    corporationId: number | null,
    shipData: { shipUuid: string; itemClassName: string; notes?: string; gridX?: number; gridZ?: number },
  ): Promise<FleetItemData> {
    return this.db.corporationFleetItem.create({
      data: {
        corporationId,
        itemType: 'ship',
        itemClassName: shipData.itemClassName,
        shipUuid: shipData.shipUuid,
        quantity: 1,
        notes: shipData.notes?.trim() || null,
        ...(Number.isFinite(shipData.gridX) ? { gridX: shipData.gridX } : {}),
        ...(Number.isFinite(shipData.gridZ) ? { gridZ: shipData.gridZ } : {}),
        addedById: userId,
      },
      select: { ...FLEET_SELECT, shipUuid: true } as typeof FLEET_SELECT,
    });
  }

  async removeOwnFleetItem(itemId: number, userId: number, isAdmin = false): Promise<void> {
    const item = await this.db.corporationFleetItem.findUnique({ where: { id: itemId } });
    if (!item) throw new Error('NOT_FOUND');
    if (!isAdmin && item.addedById !== userId) throw new Error('FORBIDDEN');
    await this.db.corporationFleetItem.delete({ where: { id: itemId } });
  }

  async updateOwnFleetItemAvailability(itemId: number, userId: number, availableForTactics: boolean): Promise<FleetItemData> {
    const item = await this.db.corporationFleetItem.findUnique({ where: { id: itemId } });
    if (!item) throw new Error('NOT_FOUND');
    if (item.addedById !== userId) throw new Error('FORBIDDEN');
    if (item.itemType !== 'ship' || item.corporationId == null) throw new Error('INVALID_SCOPE');
    return this.db.corporationFleetItem.update({
      where: { id: itemId },
      data: { availableForTactics },
      select: { ...FLEET_SELECT, shipUuid: true } as typeof FLEET_SELECT,
    });
  }

  async updateOwnFleetItemPosition(
    itemId: number,
    userId: number,
    position: { gridX: number; gridZ: number },
    allowedCorporationId: number | null = null,
    isAdmin = false,
  ): Promise<FleetItemData> {
    const item = await this.db.corporationFleetItem.findUnique({ where: { id: itemId } });
    if (!item) throw new Error('NOT_FOUND');
    if (!isAdmin && item.addedById !== userId && (allowedCorporationId == null || item.corporationId !== allowedCorporationId)) {
      throw new Error('FORBIDDEN');
    }
    return this.db.corporationFleetItem.update({
      where: { id: itemId },
      data: {
        gridX: position.gridX,
        gridZ: position.gridZ,
      },
      select: { ...FLEET_SELECT, shipUuid: true } as typeof FLEET_SELECT,
    });
  }

  async declareBankItem(
    userId: number,
    corporationId: number | null,
    data: { itemType: string; itemClassName: string; quantity?: number; notes?: string },
  ): Promise<FleetItemData> {
    return this.db.corporationFleetItem.create({
      data: {
        corporationId,
        itemType: data.itemType,
        itemClassName: data.itemClassName.trim(),
        quantity: data.quantity ?? 1,
        notes: data.notes?.trim() || null,
        addedById: userId,
      },
      select: FLEET_SELECT,
    });
  }
}
