/**
 * Authorization integration tests — real auth middleware, no mocks on
 * resolveExternalApiAccess/requireAdminKey/requireInternalOrAdmin.
 *
 * Starvis has no user accounts: the admin key guards `/admin/*`, API tokens are
 * validated against their own row, and `/api/v1` also answers anonymously.
 * Tokens issued before the accounts were removed (with `sub`, `username`, `role`
 * claims and a `userId`) must keep working.
 */
import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const JWT_SECRET = 'authz-test-secret-at-least-32-characters-long';
const ADMIN_API_KEY = 'authz-test-admin-api-key';
const SERVER_API_KEY = 'authz-test-server-api-key';

const apiTokens: any[] = [];
const mockApiTokenDelegate = {
  create: vi.fn(async ({ data }: { data: any }) => {
    const row = {
      id: apiTokens.length + 10,
      userId: null,
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
  findUnique: vi.fn(async ({ where }: { where: { id?: number; jti?: string } }) => {
    return apiTokens.find((token) => (where.id ? token.id === where.id : token.jti === where.jti)) ?? null;
  }),
  updateMany: vi.fn(async ({ where, data }: { where: any; data: any }) => {
    const matches = apiTokens.filter((token) => {
      if (where.id && token.id !== where.id) return false;
      if (where.jti && token.jti !== where.jti) return false;
      if (where.revokedAt === null && token.revokedAt !== null) return false;
      if (where.expiresAt?.gt && token.expiresAt <= where.expiresAt.gt) return false;
      return true;
    });
    for (const token of matches) {
      const { usageCount, ...rest } = data;
      Object.assign(token, rest);
      if (usageCount?.increment) token.usageCount += usageCount.increment;
    }
    return { count: matches.length };
  }),
  findMany: vi.fn(async ({ take }: { take?: number } = {}) => apiTokens.slice(0, take ?? apiTokens.length)),
};

const prismaMock = { apiToken: mockApiTokenDelegate };

vi.mock('@starvis/db', () => ({
  getPrisma: () => prismaMock,
  initPrisma: vi.fn(),
  resolveEnv: (env: string | undefined) => (env === 'ptu' ? 'ptu' : 'live'),
}));

process.env.JWT_SECRET = JWT_SECRET;
process.env.ADMIN_API_KEY = ADMIN_API_KEY;
process.env.SERVER_API_KEY = SERVER_API_KEY;

const { mountAdminRoutes } = await import('../src/routes/admin.js');
const { resolveExternalApiAccess, requireInternalOrAdmin } = await import('../src/middleware/index.js');
const { hashApiToken } = await import('../src/services/api-token-service.js');

/** A token as the removed account flow used to issue it: user claims and a userId. */
function seedLegacyToken(overrides: Partial<{ revokedAt: Date | null; expiresAt: Date }> = {}): string {
  const jti = `legacy-${apiTokens.length}`;
  const token = jwt.sign(
    { sub: 3, uuid: 'uuid-3', email: 'user3@example.com', username: 'user3', role: 'developer', type: 'api_token', jti },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
  apiTokens.push({
    id: apiTokens.length + 10,
    jti,
    tokenHash: hashApiToken(token),
    name: 'Legacy integration',
    description: null,
    ownerName: 'user3',
    userId: 3,
    roleSnapshot: 'developer',
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
    revokedAt: overrides.revokedAt ?? null,
    lastUsedAt: null,
    lastUsedIp: null,
    lastUserAgent: null,
    usageCount: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  return token;
}

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  const router = express.Router();
  router.get('/api/v1/protected-data', resolveExternalApiAccess, (req, res) => {
    res.json({ success: true, authMethod: req.authMethod ?? null, owner: req.apiToken?.owner ?? null });
  });
  router.post('/api/v1/chat/ask', requireInternalOrAdmin, (_req, res) => {
    res.json({ success: true });
  });
  const deps = { prisma: prismaMock, shipMatrixService: { getStats: vi.fn(async () => ({})) }, gameDataService: null } as any;
  mountAdminRoutes(router, deps);
  app.use('/', router);
});

beforeEach(() => {
  apiTokens.length = 0;
});

describe('admin routes authorization', () => {
  it('rejects unauthenticated access to /admin with 401', async () => {
    const res = await request(app).get('/admin/api-tokens');
    expect(res.status).toBe(401);
  });

  it('rejects an invalid admin key with 401', async () => {
    const res = await request(app).get('/admin/api-tokens').set('X-Api-Key', 'wrong-key');
    expect(res.status).toBe(401);
  });

  it('rejects the server key on /admin with 401', async () => {
    const res = await request(app).get('/admin/api-tokens').set('X-Api-Key', SERVER_API_KEY);
    expect(res.status).toBe(401);
  });

  it('rejects an API token on /admin with 401', async () => {
    const token = seedLegacyToken();
    const res = await request(app).get('/admin/api-tokens').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('accepts the admin key', async () => {
    const res = await request(app).get('/admin/api-tokens').set('X-Api-Key', ADMIN_API_KEY);
    expect(res.status).toBe(200);
  });
});

describe('external API access', () => {
  it('accepts anonymous /api/v1 calls', async () => {
    const res = await request(app).get('/api/v1/protected-data');
    expect(res.status).toBe(200);
    expect(res.body.authMethod).toBe('anonymous');
  });

  it('accepts the server key', async () => {
    const res = await request(app).get('/api/v1/protected-data').set('X-Api-Key', SERVER_API_KEY);
    expect(res.status).toBe(200);
    expect(res.body.authMethod).toBe('admin_key');
  });

  it('keeps tokens issued before the accounts were removed', async () => {
    const token = seedLegacyToken();
    const res = await request(app).get('/api/v1/protected-data').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ authMethod: 'api_token', owner: 'user3' });
    expect(apiTokens[0].usageCount).toBe(1);
  });

  it('rejects a revoked token instead of falling back to anonymous', async () => {
    const token = seedLegacyToken({ revokedAt: new Date('2026-01-02T00:00:00.000Z') });
    const res = await request(app).get('/api/v1/protected-data').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('rejects a token whose row has expired', async () => {
    const token = seedLegacyToken({ expiresAt: new Date(Date.now() - 1000) });
    const res = await request(app).get('/api/v1/protected-data').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with a different secret', async () => {
    const forged = jwt.sign({ type: 'api_token', jti: 'forged' }, 'another-secret-at-least-32-characters', { expiresIn: '5m' });
    const res = await request(app).get('/api/v1/protected-data').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('rejects an old web session JWT, now that sessions are gone', async () => {
    const session = jwt.sign({ sub: 1, username: 'user1', role: 'admin' }, JWT_SECRET, { expiresIn: '5m' });
    const res = await request(app).get('/api/v1/protected-data').set('Authorization', `Bearer ${session}`);
    expect(res.status).toBe(401);
  });

  it('does not accept the admin key as a credential on /api/v1', async () => {
    const res = await request(app).get('/api/v1/protected-data').set('X-Api-Key', ADMIN_API_KEY);
    expect(res.status).toBe(200);
    expect(res.body.authMethod).toBe('anonymous');
  });
});

describe('admin API token issuance', () => {
  it('issues a token that authenticates on /api/v1, without any account', async () => {
    const issued = await request(app)
      .post('/admin/api-tokens')
      .set('X-Api-Key', ADMIN_API_KEY)
      .send({ owner: 'Stelliverse', name: 'Production sync' });
    expect(issued.status).toBe(201);
    expect(issued.body.data).toMatchObject({ owner: 'Stelliverse', name: 'Production sync' });
    expect(apiTokens[0].userId).toBeNull();

    const res = await request(app).get('/api/v1/protected-data').set('Authorization', `Bearer ${issued.body.data.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ authMethod: 'api_token', owner: 'Stelliverse' });
  });

  it('requires an owner', async () => {
    const res = await request(app).post('/admin/api-tokens').set('X-Api-Key', ADMIN_API_KEY).send({ name: 'No owner' });
    expect(res.status).toBe(400);
  });

  it('revokes a token, which then stops authenticating', async () => {
    const token = seedLegacyToken();
    const revoked = await request(app).delete(`/admin/api-tokens/${apiTokens[0].id}`).set('X-Api-Key', ADMIN_API_KEY);
    expect(revoked.status).toBe(200);
    const res = await request(app).get('/api/v1/protected-data').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe('AI chat access', () => {
  it('rejects callers without a key', async () => {
    const res = await request(app).post('/api/v1/chat/ask').send({ messages: [] });
    expect(res.status).toBe(401);
  });

  it('rejects an API token: the assistant is not part of the external API', async () => {
    const token = seedLegacyToken();
    const res = await request(app).post('/api/v1/chat/ask').set('Authorization', `Bearer ${token}`).send({ messages: [] });
    expect(res.status).toBe(401);
  });

  it('accepts the server key and the admin key', async () => {
    for (const key of [SERVER_API_KEY, ADMIN_API_KEY]) {
      const res = await request(app).post('/api/v1/chat/ask').set('X-Api-Key', key).send({ messages: [] });
      expect(res.status).toBe(200);
    }
  });
});
