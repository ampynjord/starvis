/**
 * Authorization integration tests — real auth middleware, no mocks on
 * requireJwt/requireJwtAdmin/requireJwtDeveloperOrAdmin.
 *
 * Verifies that admin and developer-gated routes actually reject
 * unauthenticated callers (401) and insufficient roles (403), including
 * the DB role re-check that overrides a stale JWT role claim.
 */
import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const JWT_SECRET = 'authz-test-secret-at-least-32-characters-long';
const ADMIN_API_KEY = 'authz-test-admin-api-key';

// Mutable role table consulted by the middleware DB re-check (getPrisma).
const dbRoles: Record<number, string> = { 1: 'admin', 2: 'user', 3: 'developer' };

function makeUser(id: number, role: string) {
  return {
    id,
    uuid: `uuid-${id}`,
    email: `user${id}@example.com`,
    username: `user${id}`,
    role,
    avatarUrl: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    emailVerified: true,
    twoFactorEnabled: false,
    twoFactorSecret: null,
  };
}

const mockUserDelegate = {
  findUnique: vi.fn(async ({ where }: { where: { id?: number; email?: string } }) =>
    where.id && dbRoles[where.id] ? makeUser(where.id, dbRoles[where.id]) : null,
  ),
  findFirst: vi.fn(async () => null),
  findMany: vi.fn(async () => Object.entries(dbRoles).map(([id, role]) => makeUser(Number(id), role))),
  update: vi.fn(async ({ where, data }: { where: { id: number }; data: { role?: string } }) =>
    makeUser(where.id, data.role ?? dbRoles[where.id] ?? 'user'),
  ),
  create: vi.fn(),
  delete: vi.fn(),
};

vi.mock('@starvis/db', () => ({
  getPrisma: () => ({ user: mockUserDelegate }),
  initPrisma: vi.fn(),
  resolveEnv: (env: string | undefined) => (env === 'ptu' ? 'ptu' : 'live'),
  getGamePrisma: vi.fn(),
  getRsiWebsitePrisma: vi.fn(),
  getStarvisPrisma: vi.fn(),
  initAllPrisma: vi.fn(),
}));

process.env.JWT_SECRET = JWT_SECRET;
process.env.ADMIN_API_KEY = ADMIN_API_KEY;

const { mountAuthRoutes } = await import('../src/routes/auth.js');
const { mountCorporationRoutes } = await import('../src/routes/corporations.js');
const { requireJwt } = await import('../src/middleware/index.js');

function signToken(id: number, role: string): string {
  return jwt.sign({ sub: id, uuid: `uuid-${id}`, email: `user${id}@example.com`, username: `user${id}`, role }, JWT_SECRET, {
    expiresIn: '5m',
  });
}

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  const router = express.Router();
  router.use('/api', requireJwt);
  const deps = { prisma: { user: mockUserDelegate }, getGamePrisma: vi.fn(), shipMatrixService: {} } as any;
  mountAuthRoutes(router, deps);
  mountCorporationRoutes(router, deps);
  app.use('/', router);
});

describe('admin routes authorization', () => {
  it('rejects unauthenticated access to GET /admin/users with 401', async () => {
    const res = await request(app).get('/admin/users');
    expect(res.status).toBe(401);
  });

  it('rejects role "user" on GET /admin/users with 403', async () => {
    const res = await request(app)
      .get('/admin/users')
      .set('Authorization', `Bearer ${signToken(2, 'user')}`);
    expect(res.status).toBe(403);
  });

  it('rejects role "developer" on GET /admin/users with 403', async () => {
    const res = await request(app)
      .get('/admin/users')
      .set('Authorization', `Bearer ${signToken(3, 'developer')}`);
    expect(res.status).toBe(403);
  });

  it('allows role "admin" on GET /admin/users', async () => {
    const res = await request(app)
      .get('/admin/users')
      .set('Authorization', `Bearer ${signToken(1, 'admin')}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects a stale admin JWT when the DB role was downgraded', async () => {
    // JWT claims admin, but user 2 is "user" in DB — the DB re-check must win.
    const res = await request(app)
      .get('/admin/users')
      .set('Authorization', `Bearer ${signToken(2, 'admin')}`);
    expect(res.status).toBe(403);
  });

  it('rejects an expired token with 401', async () => {
    const expired = jwt.sign({ sub: 1, role: 'admin' }, JWT_SECRET, { expiresIn: '-1s' });
    const res = await request(app).get('/admin/users').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with a different secret with 401', async () => {
    const forged = jwt.sign({ sub: 1, role: 'admin' }, 'wrong-secret-aaaaaaaaaaaaaaaaaaaaaaaaa', { expiresIn: '5m' });
    const res = await request(app).get('/admin/users').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('accepts a valid X-Api-Key without JWT', async () => {
    const res = await request(app).get('/admin/users').set('X-Api-Key', ADMIN_API_KEY);
    expect(res.status).toBe(200);
  });

  it('rejects an invalid X-Api-Key without JWT with 401', async () => {
    const res = await request(app).get('/admin/users').set('X-Api-Key', 'wrong-key');
    expect(res.status).toBe(401);
  });

  it('rejects role "user" on PUT /admin/users/:id/role with 403', async () => {
    const res = await request(app)
      .put('/admin/users/2/role')
      .set('Authorization', `Bearer ${signToken(2, 'user')}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(403);
  });

  it('allows admin to change a role via PUT /admin/users/:id/role', async () => {
    const res = await request(app)
      .put('/admin/users/2/role')
      .set('Authorization', `Bearer ${signToken(1, 'admin')}`)
      .send({ role: 'developer' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('developer');
  });

  it('rejects role "user" on admin corporation routes with 403', async () => {
    const res = await request(app)
      .put('/admin/corporations/1')
      .set('Authorization', `Bearer ${signToken(2, 'user')}`)
      .send({ name: 'x' });
    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated access to admin corporation routes with 401', async () => {
    const res = await request(app).get('/admin/corporations');
    expect(res.status).toBe(401);
  });
});

describe('developer-gated routes authorization', () => {
  it('rejects role "user" on POST /auth/api-token with 403', async () => {
    const res = await request(app)
      .post('/auth/api-token')
      .set('Authorization', `Bearer ${signToken(2, 'user')}`);
    expect(res.status).toBe(403);
  });

  it('allows role "developer" on POST /auth/api-token', async () => {
    const res = await request(app)
      .post('/auth/api-token')
      .set('Authorization', `Bearer ${signToken(3, 'developer')}`);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('allows role "admin" on POST /auth/api-token', async () => {
    const res = await request(app)
      .post('/auth/api-token')
      .set('Authorization', `Bearer ${signToken(1, 'admin')}`);
    expect(res.status).toBe(200);
  });
});

describe('authenticated user routes', () => {
  it('rejects unauthenticated GET /auth/me with 401', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the profile for a valid token', async () => {
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${signToken(2, 'user')}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(2);
  });
});
