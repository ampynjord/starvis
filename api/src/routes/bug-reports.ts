/**
 * POST /api/v1/bug-reports       — submit a bug report (any logged-in user)
 * GET  /admin/bug-reports         — list all reports (admin)
 * GET  /admin/bug-reports/:id     — get one report (admin)
 * PATCH /admin/bug-reports/:id    — update status (admin)
 */
import type { Router } from 'express';
import { requireJwt, requireJwtAdmin } from '../middleware/index.js';
import { sendBugReportNotification } from '../services/email-service.js';
import { asyncHandler } from './helpers.js';
import type { RouteDependencies } from './types.js';

const MAX_ATTACHMENT_SIZE = 4 * 1024 * 1024; // 4 MB per attachment
const MAX_ATTACHMENTS = 5;

interface Attachment {
  name: string;
  type: string;
  data: string; // base64
}

function validateAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (a): a is Attachment =>
        a !== null &&
        typeof a === 'object' &&
        typeof (a as any).name === 'string' &&
        typeof (a as any).type === 'string' &&
        typeof (a as any).data === 'string',
    )
    .slice(0, MAX_ATTACHMENTS)
    .filter((a) => {
      const byteLen = Math.ceil((a.data.length * 3) / 4);
      return byteLen <= MAX_ATTACHMENT_SIZE;
    });
}

export function mountBugReportRoutes(router: Router, deps: RouteDependencies): void {
  const { prisma } = deps;

  // ── User: submit report ──────────────────────────────────────────────────────
  router.post(
    '/api/v1/bug-reports',
    requireJwt,
    asyncHandler(async (req, res) => {
      const payload = (req as any).jwtPayload;
      const { title, description, attachments } = req.body ?? {};

      if (typeof title !== 'string' || title.trim().length === 0 || title.length > 200) {
        return void res.status(400).json({ success: false, error: 'title is required (max 200 chars)' });
      }
      if (typeof description !== 'string' || description.trim().length === 0) {
        return void res.status(400).json({ success: false, error: 'description is required' });
      }
      if (description.length > 20_000) {
        return void res.status(400).json({ success: false, error: 'description too long (max 20 000 chars)' });
      }

      const validAttachments = validateAttachments(attachments);

      const report = await (prisma as any).bugReport.create({
        data: {
          userId: payload.sub,
          title: title.trim(),
          description: description.trim(),
          attachments: validAttachments,
        },
        include: { user: { select: { username: true } } },
      });

      // Fire-and-forget email notification
      sendBugReportNotification({
        id: report.id,
        title: report.title,
        description: report.description,
        username: report.user.username,
        createdAt: report.createdAt,
      }).catch(() => {});

      res.status(201).json({ success: true, data: { id: report.id } });
    }),
  );

  // ── Admin: list reports ──────────────────────────────────────────────────────
  router.get(
    '/admin/bug-reports',
    requireJwtAdmin,
    asyncHandler(async (req, res) => {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const page = Math.max(1, Number(req.query.page ?? 1));
      const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
      const offset = (page - 1) * limit;

      const where = status ? { status } : {};

      const [total, data] = await Promise.all([
        (prisma as any).bugReport.count({ where }),
        (prisma as any).bugReport.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
          include: { user: { select: { id: true, username: true, email: true } } },
        }),
      ]);

      res.json({ success: true, total, page, limit, data });
    }),
  );

  // ── Admin: get one report ────────────────────────────────────────────────────
  router.get(
    '/admin/bug-reports/:id',
    requireJwtAdmin,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return void res.status(400).json({ success: false, error: 'Invalid id' });
      }
      const report = await (prisma as any).bugReport.findUnique({
        where: { id },
        include: { user: { select: { id: true, username: true, email: true } } },
      });
      if (!report) return void res.status(404).json({ success: false, error: 'Report not found' });
      res.json({ success: true, data: report });
    }),
  );

  // ── Admin: update status ─────────────────────────────────────────────────────
  router.patch(
    '/admin/bug-reports/:id',
    requireJwtAdmin,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return void res.status(400).json({ success: false, error: 'Invalid id' });
      }
      const { status } = req.body ?? {};
      if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
        return void res.status(400).json({ success: false, error: 'status must be open|in_progress|resolved|closed' });
      }
      const report = await (prisma as any).bugReport.update({ where: { id }, data: { status } });
      res.json({ success: true, data: report });
    }),
  );
}
