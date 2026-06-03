import type { PrismaLike } from '@starvis/db';
import type { RsiOrg } from './rsi-orgs-service.js';

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
  _count?: { memberships: number; fleetItems: number };
}

export interface MembershipData {
  id: number;
  userId: number;
  corporationId: number;
  rank: string | null;
  declaredAt: Date;
  user: { id: number; username: string; email: string; avatarUrl: string | null };
  corporation?: { id: number; name: string; tag: string };
}

export interface FleetItemData {
  id: number;
  corporationId: number;
  itemType: string;
  itemClassName: string;
  shipUuid?: string | null;
  quantity: number;
  notes: string | null;
  addedById: number | null;
  addedAt: Date;
  updatedAt: Date;
  addedBy?: { id: number; username: string } | null;
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

  // ── Corporations ────────────────────────────────────────────────────────────

  async listCorporations(): Promise<CorporationData[]> {
    return this.db.corporation.findMany({
      select: CORP_SELECT,
      orderBy: { rsiMemberCount: 'desc' },
    });
  }

  async getCorporation(id: number): Promise<CorporationData | null> {
    return this.db.corporation.findUnique({ where: { id }, select: CORP_SELECT });
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

  async deleteCorporation(id: number): Promise<void> {
    await this.db.corporation.delete({ where: { id } });
  }

  // ── Membership — instant declaration, no pending ─────────────────────────────

  async getMyMembership(userId: number): Promise<MembershipData | null> {
    return this.db.corporationMembership.findFirst({
      where: { userId },
      select: MEMBERSHIP_SELECT,
    });
  }

  async getUserMembership(userId: number): Promise<MembershipData | null> {
    return this.db.corporationMembership.findFirst({
      where: { userId },
      select: MEMBERSHIP_SELECT,
    });
  }

  // Declare RSI org membership (instant, no approval needed)
  async declareOrgMembership(userId: number, org: RsiOrg): Promise<MembershipData> {
    const corp = await this.upsertFromRsi(org);
    // Remove any existing membership first
    await this.db.corporationMembership.deleteMany({ where: { userId } });
    return this.db.corporationMembership.create({
      data: { userId, corporationId: corp.id },
      select: MEMBERSHIP_SELECT,
    });
  }

  async leaveOrg(userId: number): Promise<void> {
    await this.db.corporationMembership.deleteMany({ where: { userId } });
  }

  // ── Members management ───────────────────────────────────────────────────────

  async listMembers(corporationId: number): Promise<MembershipData[]> {
    return this.db.corporationMembership.findMany({
      where: { corporationId },
      select: MEMBERSHIP_SELECT,
      orderBy: { declaredAt: 'desc' },
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
      data: { userId, corporationId },
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
    return this.db.corporationFleetItem.findMany({
      where: { corporationId },
      select: FLEET_SELECT,
      orderBy: [{ itemType: 'asc' }, { itemClassName: 'asc' }],
    });
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
    data: { itemType?: string; itemClassName?: string; quantity?: number; notes?: string | null },
  ): Promise<FleetItemData> {
    return this.db.corporationFleetItem.update({
      where: { id: itemId },
      data: {
        ...(data.itemType !== undefined ? { itemType: data.itemType } : {}),
        ...(data.itemClassName !== undefined ? { itemClassName: data.itemClassName.trim() } : {}),
        ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
      select: FLEET_SELECT,
    });
  }

  async deleteFleetItem(itemId: number): Promise<void> {
    await this.db.corporationFleetItem.delete({ where: { id: itemId } });
  }

  // ── User-facing fleet (ships only) ──────────────────────────────────────────

  async getFleetItems(corporationId: number, type: 'ship' | 'non-ship'): Promise<FleetItemData[]> {
    const where = type === 'ship' ? { corporationId, itemType: 'ship' } : { corporationId, itemType: { not: 'ship' } };
    return this.db.corporationFleetItem.findMany({
      where,
      select: { ...FLEET_SELECT, shipUuid: true } as typeof FLEET_SELECT,
      orderBy: [{ addedAt: 'desc' }],
    });
  }

  async declareShip(
    userId: number,
    corporationId: number,
    shipData: { shipUuid: string; itemClassName: string; notes?: string },
  ): Promise<FleetItemData> {
    return this.db.corporationFleetItem.create({
      data: {
        corporationId,
        itemType: 'ship',
        itemClassName: shipData.itemClassName,
        shipUuid: shipData.shipUuid,
        quantity: 1,
        notes: shipData.notes?.trim() || null,
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

  async declareBankItem(
    userId: number,
    corporationId: number,
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
