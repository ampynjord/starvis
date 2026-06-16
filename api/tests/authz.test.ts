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
const dbRoles: Record<number, string> = { 1: 'admin', 2: 'user', 3: 'developer', 4: 'user' };

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

const apiTokens: any[] = [];
const mockApiTokenDelegate = {
  create: vi.fn(async ({ data }: { data: any }) => {
    const row = {
      id: apiTokens.length + 10,
      ...data,
      revokedAt: null,
      lastUsedAt: null,
      lastUsedIp: null,
      lastUserAgent: null,
      usageCount: 0,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    apiTokens.push(row);
    return row;
  }),
  findUnique: vi.fn(async ({ where, include }: { where: { id?: number; jti?: string }; include?: any }) => {
    const row = apiTokens.find((token) => (where.id ? token.id === where.id : token.jti === where.jti));
    if (!row) return null;
    return include?.user ? { ...row, user: makeUser(row.userId, dbRoles[row.userId] ?? 'user') } : row;
  }),
  updateMany: vi.fn(async ({ where, data }: { where: any; data: any }) => {
    const matches = apiTokens.filter((token) => {
      if (where.id && token.id !== where.id) return false;
      if (where.userId && token.userId !== where.userId) return false;
      if (where.jti && token.jti !== where.jti) return false;
      if (where.revokedAt === null && token.revokedAt !== null) return false;
      if (where.expiresAt?.gt && token.expiresAt <= where.expiresAt.gt) return false;
      return true;
    });
    for (const token of matches) {
      Object.assign(token, data, { updatedAt: new Date('2026-01-01T00:00:00.000Z') });
      if (data.usageCount?.increment) token.usageCount += data.usageCount.increment;
    }
    return { count: matches.length };
  }),
  findMany: vi.fn(async ({ where, include, take }: { where?: any; include?: any; take?: number } = {}) => {
    let rows = [...apiTokens];
    if (where?.userId) rows = rows.filter((token) => token.userId === where.userId);
    if (where?.revokedAt === null) rows = rows.filter((token) => token.revokedAt === null);
    rows.sort((a, b) => (b.lastUsedAt?.getTime?.() ?? b.createdAt.getTime()) - (a.lastUsedAt?.getTime?.() ?? a.createdAt.getTime()));
    rows = rows.slice(0, take ?? rows.length);
    return include?.user ? rows.map((row) => ({ ...row, user: makeUser(row.userId, dbRoles[row.userId] ?? 'user') })) : rows;
  }),
};

const apiAccessRequests: any[] = [];
const mockExternalApiAccessRequestDelegate = {
  findFirst: vi.fn(async ({ where }: { where: { userId?: number; status?: string } }) => {
    return (
      apiAccessRequests
        .filter((r) => (where.userId ? r.userId === where.userId : true) && (where.status ? r.status === where.status : true))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
    );
  }),
  findMany: vi.fn(async ({ where }: { where?: { status?: string } } = {}) =>
    apiAccessRequests.filter((r) => (where?.status ? r.status === where.status : true)),
  ),
  create: vi.fn(async ({ data }: { data: any }) => {
    const row = {
      id: apiAccessRequests.length + 1,
      ...data,
      adminNote: null,
      reviewedById: null,
      reviewedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    apiAccessRequests.push(row);
    return row;
  }),
  update: vi.fn(async ({ where, data, include }: { where: { id: number }; data: any; include?: any }) => {
    const row = apiAccessRequests.find((r) => r.id === where.id);
    if (!row) {
      const error: any = new Error('not found');
      error.code = 'P2025';
      throw error;
    }
    Object.assign(row, data, { updatedAt: new Date('2026-01-01T00:00:00.000Z') });
    return {
      ...row,
      user: include?.user ? makeUser(row.userId, dbRoles[row.userId] ?? 'user') : undefined,
      reviewedBy: include?.reviewedBy && row.reviewedById ? { id: row.reviewedById, username: `user${row.reviewedById}` } : null,
    };
  }),
};

const prismaMock = {
  user: mockUserDelegate,
  apiToken: mockApiTokenDelegate,
  externalApiAccessRequest: mockExternalApiAccessRequestDelegate,
  $transaction: (fn: any) => fn(prismaMock),
};

vi.mock('@starvis/db', () => ({
  getPrisma: () => prismaMock,
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
const { mountAdminRoutes } = await import('../src/routes/admin.js');
const { mountCorporationRoutes } = await import('../src/routes/corporations.js');
const { requireExternalApiAccess, requireJwt } = await import('../src/middleware/index.js');

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
  router.get('/api/v1/protected-data', requireExternalApiAccess, (req, res) => {
    res.json({ success: true, actor: req.jwtPayload?.username ?? null, role: req.jwtPayload?.role ?? null });
  });
  router.use('/api', requireJwt);
  const deps = { prisma: prismaMock, getGamePrisma: vi.fn(), shipMatrixService: { getStats: vi.fn() }, gameDataService: null } as any;
  mountAuthRoutes(router, deps);
  mountAdminRoutes(router, deps);
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

describe('external API authorization', () => {
  it('rejects anonymous /api/v1 calls with 401', async () => {
    const res = await request(app).get('/api/v1/protected-data');
    expect(res.status).toBe(401);
  });

  it('allows /api/v1 calls with a valid user JWT and refreshes the DB role', async () => {
    const res = await request(app)
      .get('/api/v1/protected-data')
      .set('Authorization', `Bearer ${signToken(3, 'beta_tester')}`);
    expect(res.status).toBe(200);
    expect(res.body.actor).toBe('user3');
    expect(res.body.role).toBe('developer');
  });

  it('allows trusted server-to-server /api/v1 calls with X-Api-Key', async () => {
    const res = await request(app).get('/api/v1/protected-data').set('X-Api-Key', ADMIN_API_KEY);
    expect(res.status).toBe(200);
    expect(res.body.actor).toBeNull();
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

  it('lets a developer supervise only their generated API tokens', async () => {
    await request(app)
      .post('/auth/api-token')
      .set('Authorization', `Bearer ${signToken(3, 'developer')}`)
      .send({ name: 'Developer app' });
    await request(app)
      .post('/auth/api-token')
      .set('Authorization', `Bearer ${signToken(1, 'admin')}`)
      .send({ name: 'Admin app' });

    const res = await request(app)
      .get('/auth/api-tokens?includeRevoked=true')
      .set('Authorization', `Bearer ${signToken(3, 'developer')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.every((token: any) => token.userId === 3)).toBe(true);
    expect(res.body.data.some((token: any) => token.name === 'Developer app')).toBe(true);
    expect(res.body.data.some((token: any) => token.name === 'Admin app')).toBe(false);
  });

  it('lets a token owner revoke their own API token', async () => {
    const create = await request(app)
      .post('/auth/api-token')
      .set('Authorization', `Bearer ${signToken(3, 'developer')}`)
      .send({ name: 'Temporary token' });

    const res = await request(app)
      .delete(`/auth/api-tokens/${create.body.tokenId}`)
      .set('Authorization', `Bearer ${signToken(3, 'developer')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.revokedAt).toBeTruthy();
  });

  it('prevents a developer from revoking another user API token', async () => {
    const create = await request(app)
      .post('/auth/api-token')
      .set('Authorization', `Bearer ${signToken(1, 'admin')}`)
      .send({ name: 'Admin owned token' });

    const res = await request(app)
      .delete(`/auth/api-tokens/${create.body.tokenId}`)
      .set('Authorization', `Bearer ${signToken(3, 'developer')}`);

    expect(res.status).toBe(404);
  });
});

describe('admin API token supervision', () => {
  it('lets an admin list generated API tokens with owners', async () => {
    await request(app)
      .post('/auth/api-token')
      .set('Authorization', `Bearer ${signToken(3, 'developer')}`)
      .send({ name: 'Listed app' });

    const res = await request(app)
      .get('/admin/api-tokens')
      .set('Authorization', `Bearer ${signToken(1, 'admin')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.some((token: any) => token.name === 'Listed app' && token.user?.username === 'user3')).toBe(true);
  });

  it('lets an admin revoke any active API token', async () => {
    const create = await request(app)
      .post('/auth/api-token')
      .set('Authorization', `Bearer ${signToken(3, 'developer')}`)
      .send({ name: 'Admin revoked token' });

    const res = await request(app)
      .delete(`/admin/api-tokens/${create.body.tokenId}`)
      .set('Authorization', `Bearer ${signToken(1, 'admin')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.revokedAt).toBeTruthy();
    expect(res.body.data.user.username).toBe('user3');
  });
});

describe('external API access requests', () => {
  it('allows a signed-in user to request developer API access', async () => {
    const res = await request(app)
      .post('/auth/developer-access-request')
      .set('Authorization', `Bearer ${signToken(2, 'user')}`)
      .send({ motivation: 'I am building a Discord bot and need Starvis external API data with authenticated access.' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.userId).toBe(2);
  });

  it('allows an admin to approve a pending request and promotes the user to developer', async () => {
    const create = await request(app)
      .post('/auth/developer-access-request')
      .set('Authorization', `Bearer ${signToken(4, 'user')}`)
      .send({ motivation: 'I am building an external dashboard and need Starvis API tokens for a community project.' });
    const res = await request(app)
      .patch(`/admin/developer-access-requests/${create.body.data.id}`)
      .set('Authorization', `Bearer ${signToken(1, 'admin')}`)
      .send({ status: 'approved' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    expect(mockUserDelegate.update).toHaveBeenCalledWith({ where: { id: 4 }, data: { role: 'developer' } });
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
