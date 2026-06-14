/**
 * GET  /rsi-orgs?q=&page=         — live RSI org search (public)
 *
 * GET  /corporations               — list cached orgs (public)
 * GET  /auth/me/corporation        — own membership (Bearer)
 * POST /auth/me/corporation        — declare org membership (Bearer, instant)
 * DELETE /auth/me/corporation      — leave org (Bearer)
 *
 * Admin:
 * GET    /admin/corporations              — list all
 * GET    /admin/corporations/:id          — detail
 * DELETE /admin/corporations/:id          — delete corporation data without deleting users
 * GET    /admin/corporations/:id/members  — list members
 * POST   /admin/corporations/:id/members  — add member (by userId)
 * DELETE /admin/corporations/members/:mid — remove member
 * GET    /admin/corporations/:id/fleet    — fleet items
 * POST   /admin/corporations/:id/fleet    — add fleet item
 * PUT    /admin/corporations/fleet/:fid   — update fleet item
 * DELETE /admin/corporations/fleet/:fid   — delete fleet item
 * GET    /admin/users/:id/fleet           — list fleet/bank items declared by user
 * PUT    /admin/fleet/:fid                — update any fleet/bank item
 * DELETE /admin/fleet/:fid                — delete any fleet/bank item
 * GET    /admin/users/:id/corporation     — get user's corp
 * PUT    /admin/users/:id/corporation     — set user's corp (RSI symbol)
 * DELETE /admin/users/:id/corporation     — remove user from corp
 */
import type { Router } from 'express';
import { requireJwt, requireJwtAdmin } from '../middleware/index.js';
import { CorporationService } from '../services/corporation-service.js';
import { getRsiOrgBySymbol, searchRsiOrgs } from '../services/rsi-orgs-service.js';
import type { RouteDependencies } from './types.js';

const VALID_FLEET_TYPES = ['ship', 'component', 'item', 'commodity', 'other'] as const;
const VALID_MEMBER_ROLES = ['member', 'leader'] as const;

export function mountCorporationRoutes(router: Router, deps: RouteDependencies): void {
  const svc = new CorporationService(deps.prisma);

  async function requireLeaderOrAdmin(req: any, res: any, corporationId: number): Promise<boolean> {
    const payload = req.jwtPayload;
    if (payload?.role === 'admin') return true;
    const isLeader = await svc.isCorporationLeader(payload?.sub, corporationId);
    if (!isLeader) {
      res.status(403).json({ success: false, error: 'Corporation leader or admin role required' });
      return false;
    }
    return true;
  }

  // ── Live RSI org search ──────────────────────────────────────────────────────

  router.get('/rsi-orgs', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(24, Math.max(5, Number(req.query.pageSize) || 12));
    try {
      const result = await searchRsiOrgs(q, page, pageSize);
      res.json({ success: true, data: result });
    } catch (e: any) {
      res.status(502).json({ success: false, error: `RSI API unavailable: ${e.message}` });
    }
  });

  // ── Public: cached corps list ────────────────────────────────────────────────

  router.get('/corporations', async (_req, res) => {
    try {
      const corps = await svc.listCorporations();
      res.json({ success: true, data: corps });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to fetch corporations' });
    }
  });

  // ── User: declare / leave org ────────────────────────────────────────────────

  router.get('/auth/me/corporation', requireJwt, async (req, res) => {
    const { sub } = req.jwtPayload;
    try {
      const membership = await svc.getMyMembership(sub);
      res.json({ success: true, data: membership });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to fetch membership' });
    }
  });

  // POST body: { symbol: 'TEST' }  — client already fetched RSI data, or we do it here
  router.post('/auth/me/corporation', requireJwt, async (req, res) => {
    const { sub } = req.jwtPayload;
    const { symbol, name, logoUrl, archetype, language, commitment, recruiting, roleplay, memberCount } = req.body ?? {};
    if (!symbol || typeof symbol !== 'string') {
      return void res.status(400).json({ success: false, error: 'symbol required' });
    }
    try {
      // Use client-provided RSI data if present, otherwise fetch from RSI
      const org = name
        ? {
            symbol: symbol.toUpperCase(),
            name,
            logoUrl: logoUrl ?? null,
            archetype: archetype ?? null,
            language: language ?? null,
            commitment: commitment ?? null,
            recruiting: !!recruiting,
            roleplay: !!roleplay,
            memberCount: memberCount ?? null,
          }
        : await getRsiOrgBySymbol(symbol);

      if (!org) return void res.status(404).json({ success: false, error: 'RSI org not found' });

      const membership = await svc.requestOrgMembership(sub, org);
      res.status(202).json({ success: true, data: membership, status: 'pending' });
    } catch (_e: any) {
      res.status(500).json({ success: false, error: 'Failed to request membership' });
    }
  });

  router.get('/corp', requireJwt, async (req, res) => {
    const { sub } = req.jwtPayload;
    try {
      const membership = await svc.getMyActiveMembership(sub);
      if (!membership) return void res.status(403).json({ success: false, error: 'Not an approved corporation member' });
      const [members, pending, fleet] = await Promise.all([
        svc.listMembers(membership.corporationId),
        membership.role === 'leader' ? svc.listPendingMemberships(membership.corporationId) : Promise.resolve([]),
        svc.getFleet(membership.corporationId),
      ]);
      res.json({
        success: true,
        data: {
          membership,
          corporation: membership.corporation,
          members,
          pendingMemberships: pending,
          fleet,
        },
      });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to fetch corporation workspace' });
    }
  });

  // ── Corp members (any member can view) ──────────────────────────────────────

  router.get('/corp/members', requireJwt, async (req, res) => {
    const { sub } = req.jwtPayload;
    try {
      const membership = await svc.getMyActiveMembership(sub);
      if (!membership) return void res.status(403).json({ success: false, error: 'Not a corporation member' });
      const members = await svc.listMembers(membership.corporationId);
      res.json({ success: true, data: members, corporation: membership.corporation });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to fetch members' });
    }
  });

  // ── User fleet (ships declared by corp members) ──────────────────────────────

  router.get('/corp/fleet', requireJwt, async (req, res) => {
    const { sub } = req.jwtPayload;
    try {
      const membership = await svc.getMyActiveMembership(sub);
      const corporationId = membership?.corporationId ?? null;
      const items = await svc.getFleetItems(corporationId, 'ship', sub);
      res.json({
        success: true,
        data: items,
        corporation: membership?.corporation ?? null,
        scope: corporationId == null ? 'personal' : 'corporation',
      });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to fetch fleet' });
    }
  });

  router.post('/corp/fleet', requireJwt, async (req, res) => {
    const { sub } = req.jwtPayload;
    const { shipUuid, itemClassName, notes, gridX, gridZ } = req.body ?? {};
    if (!shipUuid || typeof shipUuid !== 'string') return void res.status(400).json({ success: false, error: 'shipUuid required' });
    if (!itemClassName || typeof itemClassName !== 'string')
      return void res.status(400).json({ success: false, error: 'itemClassName required' });
    const initialGridX = typeof gridX === 'number' && Number.isFinite(gridX) ? gridX : undefined;
    const initialGridZ = typeof gridZ === 'number' && Number.isFinite(gridZ) ? gridZ : undefined;
    try {
      const membership = await svc.getMyActiveMembership(sub);
      const item = await svc.declareShip(sub, membership?.corporationId ?? null, {
        shipUuid,
        itemClassName,
        notes,
        gridX: initialGridX,
        gridZ: initialGridZ,
      });
      res.status(201).json({ success: true, data: item });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to declare ship' });
    }
  });

  router.delete('/corp/fleet/:id', requireJwt, async (req, res) => {
    const { sub } = req.jwtPayload;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return void res.status(400).json({ success: false, error: 'Invalid id' });
    try {
      await svc.removeOwnFleetItem(id, sub, false);
      res.json({ success: true });
    } catch (e: any) {
      if (e.message === 'NOT_FOUND') return void res.status(404).json({ success: false, error: 'Fleet item not found' });
      if (e.message === 'FORBIDDEN')
        return void res.status(403).json({ success: false, error: 'You can only remove your own declarations' });
      res.status(500).json({ success: false, error: 'Failed to remove fleet item' });
    }
  });

  router.patch('/corp/fleet/:id/position', requireJwt, async (req, res) => {
    const { sub } = req.jwtPayload;
    const id = Number(req.params.id);
    const gridX = Number(req.body?.gridX);
    const gridZ = Number(req.body?.gridZ);
    if (!Number.isInteger(id) || id <= 0) return void res.status(400).json({ success: false, error: 'Invalid id' });
    if (!Number.isFinite(gridX) || !Number.isFinite(gridZ)) {
      return void res.status(400).json({ success: false, error: 'gridX and gridZ must be numbers' });
    }
    try {
      const membership = await svc.getMyActiveMembership(sub);
      const item = await svc.updateOwnFleetItemPosition(id, sub, { gridX, gridZ }, membership?.corporationId ?? null, false);
      res.json({ success: true, data: item });
    } catch (e: any) {
      if (e.message === 'NOT_FOUND') return void res.status(404).json({ success: false, error: 'Fleet item not found' });
      if (e.message === 'FORBIDDEN')
        return void res.status(403).json({ success: false, error: 'You can only move fleet positions in your scope' });
      res.status(500).json({ success: false, error: 'Failed to update fleet position' });
    }
  });

  router.patch('/corp/fleet/:id/availability', requireJwt, async (req, res) => {
    const { sub } = req.jwtPayload;
    const id = Number(req.params.id);
    const availableForTactics = Boolean(req.body?.availableForTactics);
    if (!Number.isInteger(id) || id <= 0) return void res.status(400).json({ success: false, error: 'Invalid id' });
    try {
      const item = await svc.updateOwnFleetItemAvailability(id, sub, availableForTactics);
      res.json({ success: true, data: item });
    } catch (e: any) {
      if (e.message === 'NOT_FOUND') return void res.status(404).json({ success: false, error: 'Fleet item not found' });
      if (e.message === 'FORBIDDEN')
        return void res.status(403).json({ success: false, error: 'Only the ship owner can change tactics availability' });
      if (e.message === 'INVALID_SCOPE')
        return void res.status(400).json({ success: false, error: 'Only corporation ships can be made available for tactics' });
      res.status(500).json({ success: false, error: 'Failed to update fleet availability' });
    }
  });

  // ── Corp bank (equipment, components, items, commodities) ────────────────────

  router.get('/corp/bank', requireJwt, async (req, res) => {
    const { sub } = req.jwtPayload;
    try {
      const membership = await svc.getMyActiveMembership(sub);
      if (!membership) return void res.status(403).json({ success: false, error: 'Not a corporation member' });
      const items = await svc.getFleetItems(membership.corporationId, 'non-ship');
      res.json({ success: true, data: items, corporation: membership.corporation, canManage: membership.role === 'leader' });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to fetch bank' });
    }
  });

  router.put('/corp/bank/:id', requireJwt, async (req, res) => {
    const { sub, role } = req.jwtPayload;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return void res.status(400).json({ success: false, error: 'Invalid id' });
    const { itemType, itemClassName, quantity, notes } = req.body ?? {};
    if (itemType !== undefined && !['component', 'item', 'commodity', 'other'].includes(itemType)) {
      return void res.status(400).json({ success: false, error: 'itemType must be component, item, commodity, or other' });
    }
    if (quantity !== undefined && (!Number.isInteger(Number(quantity)) || Number(quantity) <= 0)) {
      return void res.status(400).json({ success: false, error: 'quantity must be a positive integer' });
    }
    try {
      const membership = await svc.getMyActiveMembership(sub);
      if (!membership) return void res.status(403).json({ success: false, error: 'Not a corporation member' });
      const canManage = role === 'admin' || membership.role === 'leader';
      const item = await svc.updateCorporationFleetItem(id, membership.corporationId, sub, canManage, {
        itemType,
        itemClassName,
        quantity: quantity !== undefined ? Number(quantity) : undefined,
        notes: notes === undefined ? undefined : notes?.trim() || null,
      });
      res.json({ success: true, data: item });
    } catch (e: any) {
      if (e.message === 'NOT_FOUND') return void res.status(404).json({ success: false, error: 'Item not found' });
      if (e.message === 'FORBIDDEN')
        return void res.status(403).json({ success: false, error: 'You can only manage items in your corporation scope' });
      res.status(500).json({ success: false, error: 'Failed to update item' });
    }
  });

  router.post('/corp/bank', requireJwt, async (req, res) => {
    const { sub } = req.jwtPayload;
    const { itemType, itemClassName, quantity, notes } = req.body ?? {};
    if (!itemType || !['component', 'item', 'commodity', 'other'].includes(itemType)) {
      return void res.status(400).json({ success: false, error: 'itemType must be component, item, commodity, or other' });
    }
    if (!itemClassName || typeof itemClassName !== 'string')
      return void res.status(400).json({ success: false, error: 'itemClassName required' });
    try {
      const membership = await svc.getMyActiveMembership(sub);
      if (!membership) return void res.status(403).json({ success: false, error: 'Not a corporation member' });
      const item = await svc.declareBankItem(sub, membership.corporationId, { itemType, itemClassName, quantity, notes });
      res.status(201).json({ success: true, data: item });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to declare item' });
    }
  });

  router.delete('/corp/bank/:id', requireJwt, async (req, res) => {
    const { sub } = req.jwtPayload;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return void res.status(400).json({ success: false, error: 'Invalid id' });
    try {
      const membership = await svc.getMyActiveMembership(sub);
      if (!membership) return void res.status(403).json({ success: false, error: 'Not a corporation member' });
      const canManage = req.jwtPayload.role === 'admin' || membership.role === 'leader';
      await svc.removeCorporationFleetItem(id, membership.corporationId, sub, canManage);
      res.json({ success: true });
    } catch (e: any) {
      if (e.message === 'NOT_FOUND') return void res.status(404).json({ success: false, error: 'Item not found' });
      if (e.message === 'FORBIDDEN')
        return void res.status(403).json({ success: false, error: 'You can only remove your own declarations' });
      res.status(500).json({ success: false, error: 'Failed to remove item' });
    }
  });

  router.delete('/auth/me/corporation', requireJwt, async (req, res) => {
    const { sub } = req.jwtPayload;
    try {
      await svc.leaveOrg(sub);
      res.json({ success: true });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to leave corporation' });
    }
  });

  // ── Admin: corporations ──────────────────────────────────────────────────────

  router.get('/admin/corporations', requireJwtAdmin, async (_req, res) => {
    try {
      const corps = await svc.listCorporations();
      res.json({ success: true, data: corps });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to fetch corporations' });
    }
  });

  router.post('/admin/corporations', requireJwtAdmin, async (req, res) => {
    const { symbol, name, logoUrl, archetype, language, commitment, recruiting, roleplay, memberCount } = req.body ?? {};
    if (!symbol || typeof symbol !== 'string') return void res.status(400).json({ success: false, error: 'symbol required' });
    try {
      const org =
        typeof name === 'string' && name.trim()
          ? {
              symbol: symbol.toUpperCase(),
              name,
              logoUrl: logoUrl ?? null,
              archetype: archetype ?? null,
              language: language ?? null,
              commitment: commitment ?? null,
              recruiting: !!recruiting,
              roleplay: !!roleplay,
              memberCount: memberCount ?? null,
            }
          : await getRsiOrgBySymbol(symbol);
      if (!org) return void res.status(404).json({ success: false, error: 'RSI org not found' });
      const corp = await svc.upsertFromRsi(org);
      res.status(201).json({ success: true, data: corp });
    } catch (e: any) {
      if (e?.code === 'P2002') return void res.status(409).json({ success: false, error: 'Corporation name or tag already exists' });
      res.status(500).json({ success: false, error: 'Failed to import corporation' });
    }
  });

  router.get('/admin/corporations/pending', requireJwtAdmin, async (_req, res) => {
    try {
      const pending = await svc.listPendingMemberships();
      res.json({ success: true, data: pending });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to fetch pending memberships' });
    }
  });

  router.get('/admin/corporations/:id', requireJwtAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return void res.status(400).json({ success: false, error: 'Invalid id' });
    try {
      const corp = await svc.getCorporation(id);
      if (!corp) return void res.status(404).json({ success: false, error: 'Corporation not found' });
      res.json({ success: true, data: corp });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to fetch corporation' });
    }
  });

  router.put('/admin/corporations/:id', requireJwtAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return void res.status(400).json({ success: false, error: 'Invalid id' });
    const { name, tag, description, logoUrl } = req.body ?? {};
    try {
      const corp = await svc.updateCorporation(id, { name, tag, description, logoUrl });
      res.json({ success: true, data: corp });
    } catch (e: any) {
      if (e?.code === 'P2025') return void res.status(404).json({ success: false, error: 'Corporation not found' });
      if (e?.code === 'P2002') return void res.status(409).json({ success: false, error: 'Corporation name or tag already exists' });
      res.status(500).json({ success: false, error: 'Failed to update corporation' });
    }
  });

  router.delete('/admin/corporations/:id', requireJwtAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return void res.status(400).json({ success: false, error: 'Invalid id' });
    try {
      const result = await svc.deleteCorporation(id);
      res.json({ success: true, data: result });
    } catch (e: any) {
      if (e?.code === 'P2025') return void res.status(404).json({ success: false, error: 'Corporation not found' });
      res.status(500).json({ success: false, error: 'Failed to delete corporation' });
    }
  });

  // ── Admin: members ───────────────────────────────────────────────────────────

  router.get('/admin/corporations/:id/members', requireJwtAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return void res.status(400).json({ success: false, error: 'Invalid id' });
    try {
      const members = await svc.listMembers(id);
      res.json({ success: true, data: members });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to fetch members' });
    }
  });

  router.post('/admin/corporations/:id/members', requireJwtAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return void res.status(400).json({ success: false, error: 'Invalid id' });
    const { userId } = req.body ?? {};
    if (!Number.isInteger(userId) || userId <= 0) return void res.status(400).json({ success: false, error: 'userId required' });
    try {
      const membership = await svc.adminAddMember(id, userId);
      res.status(201).json({ success: true, data: membership });
    } catch (e: any) {
      if (e.message === 'CORP_NOT_FOUND') return void res.status(404).json({ success: false, error: 'Corporation not found' });
      if (e.message === 'USER_NOT_FOUND') return void res.status(404).json({ success: false, error: 'User not found' });
      res.status(500).json({ success: false, error: 'Failed to add member' });
    }
  });

  router.delete('/admin/corporations/members/:mid', requireJwtAdmin, async (req, res) => {
    const mid = Number(req.params.mid);
    if (!Number.isInteger(mid) || mid <= 0) return void res.status(400).json({ success: false, error: 'Invalid membership id' });
    try {
      await svc.removeMembership(mid);
      res.json({ success: true });
    } catch (e: any) {
      if (e?.code === 'P2025') return void res.status(404).json({ success: false, error: 'Membership not found' });
      res.status(500).json({ success: false, error: 'Failed to remove member' });
    }
  });

  router.put('/admin/corporations/memberships/:mid/approve', requireJwtAdmin, async (req, res) => {
    const mid = Number(req.params.mid);
    const reviewerId = req.jwtPayload?.sub;
    if (!Number.isInteger(mid) || mid <= 0) return void res.status(400).json({ success: false, error: 'Invalid membership id' });
    const role = VALID_MEMBER_ROLES.includes(req.body?.role) ? req.body.role : 'member';
    try {
      const membership = await svc.approveMembership(mid, reviewerId, role);
      res.json({ success: true, data: membership });
    } catch (e: any) {
      if (e.message === 'NOT_FOUND' || e?.code === 'P2025')
        return void res.status(404).json({ success: false, error: 'Membership not found' });
      res.status(500).json({ success: false, error: 'Failed to approve membership' });
    }
  });

  router.put('/admin/corporations/memberships/:mid/reject', requireJwtAdmin, async (req, res) => {
    const mid = Number(req.params.mid);
    const reviewerId = req.jwtPayload?.sub;
    if (!Number.isInteger(mid) || mid <= 0) return void res.status(400).json({ success: false, error: 'Invalid membership id' });
    try {
      const membership = await svc.rejectMembership(mid, reviewerId);
      res.json({ success: true, data: membership });
    } catch (e: any) {
      if (e?.code === 'P2025') return void res.status(404).json({ success: false, error: 'Membership not found' });
      res.status(500).json({ success: false, error: 'Failed to reject membership' });
    }
  });

  router.put('/admin/corporations/members/:mid/role', requireJwtAdmin, async (req, res) => {
    const mid = Number(req.params.mid);
    const { role } = req.body ?? {};
    if (!Number.isInteger(mid) || mid <= 0) return void res.status(400).json({ success: false, error: 'Invalid membership id' });
    if (!VALID_MEMBER_ROLES.includes(role)) return void res.status(400).json({ success: false, error: 'role must be member or leader' });
    try {
      const membership = await svc.updateMembershipRole(mid, role);
      res.json({ success: true, data: membership });
    } catch (e: any) {
      if (e?.code === 'P2025') return void res.status(404).json({ success: false, error: 'Membership not found' });
      res.status(500).json({ success: false, error: 'Failed to update role' });
    }
  });

  router.get('/corp/pending', requireJwt, async (req, res) => {
    const membership = await svc.getMyActiveMembership(req.jwtPayload.sub);
    if (!membership) return void res.status(403).json({ success: false, error: 'Not a corporation member' });
    if (!(await requireLeaderOrAdmin(req, res, membership.corporationId))) return;
    const pending = await svc.listPendingMemberships(membership.corporationId);
    res.json({ success: true, data: pending });
  });

  router.put('/corp/memberships/:mid/approve', requireJwt, async (req, res) => {
    const mid = Number(req.params.mid);
    const reviewerId = req.jwtPayload.sub;
    if (!Number.isInteger(mid) || mid <= 0) return void res.status(400).json({ success: false, error: 'Invalid membership id' });
    const role = VALID_MEMBER_ROLES.includes(req.body?.role) ? req.body.role : 'member';
    const membership = await svc.getMembership(mid);
    if (!membership) return void res.status(404).json({ success: false, error: 'Membership not found' });
    if (!(await requireLeaderOrAdmin(req, res, membership.corporationId))) return;
    const approved = await svc.approveMembership(mid, reviewerId, role);
    res.json({ success: true, data: approved });
  });

  router.put('/corp/memberships/:mid/reject', requireJwt, async (req, res) => {
    const mid = Number(req.params.mid);
    const reviewerId = req.jwtPayload.sub;
    if (!Number.isInteger(mid) || mid <= 0) return void res.status(400).json({ success: false, error: 'Invalid membership id' });
    const membership = await svc.getMembership(mid);
    if (!membership) return void res.status(404).json({ success: false, error: 'Membership not found' });
    if (!(await requireLeaderOrAdmin(req, res, membership.corporationId))) return;
    const rejected = await svc.rejectMembership(mid, reviewerId);
    res.json({ success: true, data: rejected });
  });

  router.put('/corp/members/:mid/role', requireJwt, async (req, res) => {
    const mid = Number(req.params.mid);
    const { role } = req.body ?? {};
    if (!Number.isInteger(mid) || mid <= 0) return void res.status(400).json({ success: false, error: 'Invalid membership id' });
    if (!VALID_MEMBER_ROLES.includes(role)) return void res.status(400).json({ success: false, error: 'role must be member or leader' });
    const membership = await svc.getMembership(mid);
    if (!membership) return void res.status(404).json({ success: false, error: 'Membership not found' });
    if (!(await requireLeaderOrAdmin(req, res, membership.corporationId))) return;
    const updated = await svc.updateMembershipRole(mid, role);
    res.json({ success: true, data: updated });
  });

  router.delete('/corp/members/:mid', requireJwt, async (req, res) => {
    const mid = Number(req.params.mid);
    const requesterId = req.jwtPayload.sub;
    if (!Number.isInteger(mid) || mid <= 0) return void res.status(400).json({ success: false, error: 'Invalid membership id' });
    const membership = await svc.getMembership(mid);
    if (!membership) return void res.status(404).json({ success: false, error: 'Membership not found' });
    if (membership.userId === requesterId) {
      return void res.status(400).json({ success: false, error: 'Use leave corporation from your profile to remove yourself' });
    }
    if (!(await requireLeaderOrAdmin(req, res, membership.corporationId))) return;
    await svc.removeMembership(mid);
    res.json({ success: true });
  });

  // ── Admin: users ↔ corp ──────────────────────────────────────────────────────

  router.get('/admin/users/:id/corporation', requireJwtAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return void res.status(400).json({ success: false, error: 'Invalid id' });
    try {
      const membership = await svc.getUserMembership(id);
      res.json({ success: true, data: membership });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to fetch membership' });
    }
  });

  router.put('/admin/users/:id/corporation', requireJwtAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return void res.status(400).json({ success: false, error: 'Invalid id' });
    const { symbol, name, logoUrl, archetype, language, commitment, recruiting, roleplay, memberCount } = req.body ?? {};
    if (!symbol || typeof symbol !== 'string') return void res.status(400).json({ success: false, error: 'symbol required' });
    try {
      const org = name
        ? {
            symbol: symbol.toUpperCase(),
            name,
            logoUrl: logoUrl ?? null,
            archetype: archetype ?? null,
            language: language ?? null,
            commitment: commitment ?? null,
            recruiting: !!recruiting,
            roleplay: !!roleplay,
            memberCount: memberCount ?? null,
          }
        : await getRsiOrgBySymbol(symbol);
      if (!org) return void res.status(404).json({ success: false, error: 'RSI org not found' });
      const membership = await svc.adminSetUserCorporation(id, org);
      res.json({ success: true, data: membership });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to set corporation' });
    }
  });

  router.delete('/admin/users/:id/corporation', requireJwtAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return void res.status(400).json({ success: false, error: 'Invalid id' });
    try {
      await svc.adminRemoveUserFromCorporation(id);
      res.json({ success: true });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to remove from corporation' });
    }
  });

  router.get('/admin/users/:id/fleet', requireJwtAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return void res.status(400).json({ success: false, error: 'Invalid id' });
    try {
      const items = await svc.getFleetItemsByUser(id);
      res.json({ success: true, data: items });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to fetch user fleet' });
    }
  });

  // ── Admin: fleet ─────────────────────────────────────────────────────────────

  router.get('/admin/corporations/:id/fleet', requireJwtAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return void res.status(400).json({ success: false, error: 'Invalid id' });
    try {
      const fleet = await svc.getFleet(id);
      res.json({ success: true, data: fleet });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to fetch fleet' });
    }
  });

  router.post('/admin/corporations/:id/fleet', requireJwtAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const adminId = req.jwtPayload?.sub;
    if (!Number.isInteger(id) || id <= 0) return void res.status(400).json({ success: false, error: 'Invalid id' });
    const { itemType, itemClassName, quantity, notes } = req.body ?? {};
    if (!itemType || !VALID_FLEET_TYPES.includes(itemType)) {
      return void res.status(400).json({ success: false, error: `itemType must be one of: ${VALID_FLEET_TYPES.join(', ')}` });
    }
    if (!itemClassName || typeof itemClassName !== 'string') {
      return void res.status(400).json({ success: false, error: 'itemClassName required' });
    }
    try {
      const item = await svc.addFleetItem(id, { itemType, itemClassName, quantity, notes }, adminId);
      res.status(201).json({ success: true, data: item });
    } catch (e: any) {
      if (e.message === 'CORP_NOT_FOUND') return void res.status(404).json({ success: false, error: 'Corporation not found' });
      res.status(500).json({ success: false, error: 'Failed to add fleet item' });
    }
  });

  router.put('/admin/corporations/fleet/:fid', requireJwtAdmin, async (req, res) => {
    const fid = Number(req.params.fid);
    if (!Number.isInteger(fid) || fid <= 0) return void res.status(400).json({ success: false, error: 'Invalid fleet item id' });
    const { itemType, itemClassName, quantity, notes } = req.body ?? {};
    if (itemType !== undefined && !VALID_FLEET_TYPES.includes(itemType)) {
      return void res.status(400).json({ success: false, error: `itemType must be one of: ${VALID_FLEET_TYPES.join(', ')}` });
    }
    try {
      const item = await svc.updateFleetItem(fid, { itemType, itemClassName, quantity, notes });
      res.json({ success: true, data: item });
    } catch (e: any) {
      if (e?.code === 'P2025') return void res.status(404).json({ success: false, error: 'Fleet item not found' });
      res.status(500).json({ success: false, error: 'Failed to update fleet item' });
    }
  });

  router.delete('/admin/corporations/fleet/:fid', requireJwtAdmin, async (req, res) => {
    const fid = Number(req.params.fid);
    if (!Number.isInteger(fid) || fid <= 0) return void res.status(400).json({ success: false, error: 'Invalid fleet item id' });
    try {
      await svc.deleteFleetItem(fid);
      res.json({ success: true });
    } catch (e: any) {
      if (e?.code === 'P2025') return void res.status(404).json({ success: false, error: 'Fleet item not found' });
      res.status(500).json({ success: false, error: 'Failed to delete fleet item' });
    }
  });

  router.put('/admin/fleet/:fid', requireJwtAdmin, async (req, res) => {
    const fid = Number(req.params.fid);
    if (!Number.isInteger(fid) || fid <= 0) return void res.status(400).json({ success: false, error: 'Invalid fleet item id' });
    const { itemType, itemClassName, quantity, notes } = req.body ?? {};
    if (itemType !== undefined && !VALID_FLEET_TYPES.includes(itemType)) {
      return void res.status(400).json({ success: false, error: `itemType must be one of: ${VALID_FLEET_TYPES.join(', ')}` });
    }
    try {
      const item = await svc.updateFleetItem(fid, {
        itemType,
        itemClassName,
        quantity: quantity !== undefined ? Number(quantity) : undefined,
        notes: notes === undefined ? undefined : notes?.trim() || null,
      });
      res.json({ success: true, data: item });
    } catch (e: any) {
      if (e?.code === 'P2025') return void res.status(404).json({ success: false, error: 'Fleet item not found' });
      res.status(500).json({ success: false, error: 'Failed to update fleet item' });
    }
  });

  router.delete('/admin/fleet/:fid', requireJwtAdmin, async (req, res) => {
    const fid = Number(req.params.fid);
    if (!Number.isInteger(fid) || fid <= 0) return void res.status(400).json({ success: false, error: 'Invalid fleet item id' });
    try {
      await svc.deleteFleetItem(fid);
      res.json({ success: true });
    } catch (e: any) {
      if (e?.code === 'P2025') return void res.status(404).json({ success: false, error: 'Fleet item not found' });
      res.status(500).json({ success: false, error: 'Failed to delete fleet item' });
    }
  });
}
