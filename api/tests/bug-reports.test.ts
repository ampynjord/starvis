import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountBugReportRoutes } from '../src/routes/bug-reports.js';

vi.mock('../src/middleware/auth.js', () => ({
  requireJwt: (_req: any, _res: any, next: any) => next(),
  requireJwtAdmin: (_req: any, _res: any, next: any) => next(),
}));

describe('admin bug report duplicates', () => {
  let prisma: any;
  let app: express.Express;

  beforeEach(() => {
    prisma = {
      bugReport: {
        count: vi.fn().mockResolvedValue(0),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    };
    app = express();
    app.use(express.json());
    const router = express.Router();
    mountBugReportRoutes(router, { prisma } as any);
    app.use('/', router);
  });

  it('rejects invalid duplicate links', async () => {
    for (const testCase of [
      { ref: 12, source: null, reference: null, status: 400, error: undefined },
      { ref: 99, source: { id: 12 }, reference: null, status: 404, error: 'Reference report not found' },
      {
        ref: 99,
        source: { id: 12 },
        reference: { id: 99, status: 'open', duplicateOfId: 2 },
        status: 400,
        error: 'Reference report must be a primary report',
      },
      {
        ref: 99,
        source: { id: 12 },
        reference: { id: 99, status: 'open', duplicateOfId: null },
        childCount: 2,
        status: 400,
        error: 'A report with duplicate children cannot become a duplicate',
      },
    ]) {
      prisma.bugReport.findUnique.mockReset();
      prisma.bugReport.count.mockReset();
      prisma.bugReport.update.mockReset();
      prisma.bugReport.count.mockResolvedValue(testCase.childCount ?? 0);
      if (testCase.source) prisma.bugReport.findUnique.mockResolvedValueOnce(testCase.source).mockResolvedValueOnce(testCase.reference);

      const res = await request(app).patch('/admin/bug-reports/12').send({ duplicateOfId: testCase.ref });

      expect(res.status).toBe(testCase.status);
      if (testCase.error) expect(res.body.error).toBe(testCase.error);
      expect(prisma.bugReport.update).not.toHaveBeenCalled();
    }
  });

  it('marks a report as duplicate using the reference status', async () => {
    prisma.bugReport.findUnique
      .mockResolvedValueOnce({ id: 12 })
      .mockResolvedValueOnce({ id: 99, status: 'in_progress', duplicateOfId: null });
    prisma.bugReport.update.mockResolvedValue({ id: 12, status: 'in_progress', duplicateOfId: 99 });

    const res = await request(app).patch('/admin/bug-reports/12').send({
      duplicateOfId: 99,
      duplicateComment: 'Same issue on the same page',
    });

    expect(res.status).toBe(200);
    expect(prisma.bugReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'in_progress', duplicateOfId: 99, duplicateComment: 'Same issue on the same page' },
      }),
    );
  });

  it('propagates a primary report status update to its duplicate children', async () => {
    prisma.bugReport.update.mockResolvedValue({ id: 12, status: 'open' });

    const res = await request(app).patch('/admin/bug-reports/12').send({ status: 'open' });

    expect(res.status).toBe(200);
    expect(prisma.bugReport.updateMany).toHaveBeenCalledWith({ where: { duplicateOfId: 12 }, data: { status: 'open' } });
  });
});
