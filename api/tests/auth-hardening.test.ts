/**
 * Auth hardening regressions (audit A4, points 1, 2, 4, 9).
 * Real auth middleware and routes; only the Prisma delegates are mocked.
 */
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import { generate } from 'otplib';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const JWT_SECRET = 'auth-hardening-secret-at-least-32-characters';

type DbUser = ReturnType<typeof makeUser>;
const users = new Map<number, DbUser>();

function makeUser(id: number, role: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    uuid: `uuid-${id}`,
    email: `user${id}@example.com`,
    username: `user${id}`,
    passwordHash: '',
    role,
    avatarUrl: null as string | null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    emailVerified: true,
    twoFactorEnabled: false,
    twoFactorSecret: null as string | null,
    ...extra,
  };
}

const apiTokens: any[] = [];

const prismaMock: any = {
  user: {
    findUnique: vi.fn(async ({ where }: any) => (where.id ? (users.get(where.id) ?? null) : null)),
    findFirst: vi.fn(async ({ where }: any) => {
      const wanted: string[] = (where?.OR ?? []).flatMap((c: any) => Object.values(c));
      return [...users.values()].find((u) => wanted.includes(u.email) || wanted.includes(u.username)) ?? null;
    }),
    findMany: vi.fn(async () => [...users.values()]),
    update: vi.fn(async ({ where, data }: any) => {
      const u = users.get(where.id);
      if (!u) throw Object.assign(new Error('not found'), { code: 'P2025' });
      Object.assign(u, data);
      return u;
    }),
    create: vi.fn(),
    delete: vi.fn(),
  },
  apiToken: {
    create: vi.fn(async ({ data }: any) => {
      const row = { id: apiTokens.length + 10, ...data, revokedAt: null, createdAt: new Date(), updatedAt: new Date() };
      apiTokens.push(row);
      return row;
    }),
    findUnique: vi.fn(async ({ where }: any) => apiTokens.find((t) => t.jti === where.jti) ?? null),
    updateMany: vi.fn(async () => ({ count: 1 })),
    findMany: vi.fn(async () => apiTokens),
  },
  externalApiAccessRequest: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
  $transaction: (fn: any) => fn(prismaMock),
};

vi.mock('@starvis/db', () => ({
  getPrisma: () => prismaMock,
  initPrisma: vi.fn(),
  resolveEnv: (env: string | undefined) => (env === 'ptu' ? 'ptu' : 'live'),
}));

process.env.JWT_SECRET = JWT_SECRET;

const { mountAuthRoutes } = await import('../src/routes/auth.js');
const { mountAdminRoutes } = await import('../src/routes/admin.js');
const { AuthService } = await import('../src/services/auth-service.js');

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  const router = express.Router();
  const deps = { prisma: prismaMock, shipMatrixService: { getStats: vi.fn() }, gameDataService: null } as any;
  mountAuthRoutes(router, deps);
  mountAdminRoutes(router, deps);
  app.use('/', router);
});

beforeEach(() => {
  users.clear();
  apiTokens.length = 0;
  users.set(1, makeUser(1, 'admin'));
  users.set(2, makeUser(2, 'user'));
});

const claims = (id: number, role: string) => ({
  sub: id,
  uuid: `uuid-${id}`,
  email: `user${id}@example.com`,
  username: `user${id}`,
  role,
});
const sign = (payload: object) => jwt.sign(payload, JWT_SECRET, { expiresIn: '5m' });
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('point 1 — purpose-bound tokens are not sessions', () => {
  it.each(['2fa_pending', 'rsi_hangar_sync'])('rejects a %s token on GET /auth/me', async (type) => {
    const res = await request(app)
      .get('/auth/me')
      .set(bearer(sign({ sub: 1, type })));
    expect(res.status).toBe(401);
  });

  it.each(['2fa_pending', 'rsi_hangar_sync'])('rejects a %s token on GET /admin/users', async (type) => {
    const res = await request(app)
      .get('/admin/users')
      .set(bearer(sign({ sub: 1, type })));
    expect(res.status).toBe(401);
  });

  it('still accepts a plain session token', async () => {
    const res = await request(app)
      .get('/auth/me')
      .set(bearer(sign(claims(2, 'user'))));
    expect(res.status).toBe(200);
  });

  it('keeps the login → 2FA → session flow working', async () => {
    const service = new AuthService(prismaMock);
    users.set(5, makeUser(5, 'user', { passwordHash: await bcrypt.hash('Str0ng!pass', 4) }));
    await service.setup2FA(5);
    const secret = (await service.setup2FA(5)).secret;
    await service.enable2FA(5, await generate({ secret }));

    const login = await service.login('user5@example.com', 'Str0ng!pass');
    expect('requires2FA' in login).toBe(true);
    const pendingToken = (login as { pendingToken: string }).pendingToken;

    // The pending token alone must not open a session…
    const asSession = await request(app).get('/auth/me').set(bearer(pendingToken));
    expect(asSession.status).toBe(401);

    // …but exchanging it with a valid TOTP code does.
    const done = await service.verify2FA(pendingToken, await generate({ secret }));
    const me = await request(app).get('/auth/me').set(bearer(done.token));
    expect(me.status).toBe(200);
  });
});

describe('point 2 — deleted users lose access immediately', () => {
  it('rejects an admin session token whose user no longer exists', async () => {
    const token = sign(claims(99, 'admin'));
    const admin = await request(app).get('/admin/users').set(bearer(token));
    const me = await request(app).get('/auth/me').set(bearer(token));
    expect([admin.status, me.status]).toEqual([401, 401]);
  });
});

describe('point 4 — API tokens stay on the external API surface', () => {
  function apiToken(id: number, role: string): string {
    const jti = `jti-${id}-${apiTokens.length}`;
    const token = sign({ ...claims(id, role), type: 'api_token', jti });
    apiTokens.push({
      id: apiTokens.length + 10,
      jti,
      userId: id,
      name: 't',
      tokenHash: createHash('sha256').update(token, 'utf8').digest('hex'),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    return token;
  }

  it('refuses an admin API token on /admin/*', async () => {
    const res = await request(app)
      .get('/admin/users')
      .set(bearer(apiToken(1, 'admin')));
    expect(res.status).toBe(403);
  });

  it('refuses an API token on /auth/* (cannot mint tokens, read or change the account)', async () => {
    const token = apiToken(1, 'admin');
    const mint = await request(app).post('/auth/api-token').set(bearer(token)).send({ name: 'child' });
    const me = await request(app).get('/auth/me').set(bearer(token));
    const del = await request(app).delete('/auth/me').set(bearer(token));
    expect([mint.status, me.status, del.status]).toEqual([403, 403, 403]);
  });

  it('still lets a session mint tokens', async () => {
    const res = await request(app)
      .post('/auth/api-token')
      .set(bearer(sign(claims(1, 'admin'))))
      .send({ name: 'ok' });
    expect(res.status).toBe(200);
  });
});

describe('point 9 — profile fields are validated', () => {
  const session = () => bearer(sign(claims(2, 'user')));
  const admin = () => bearer(sign(claims(1, 'admin')));

  it.each([['ab'], ['x'.repeat(51)], ['bad name'], ['<script>']])('rejects username %j on PUT /auth/me', async (username) => {
    const res = await request(app).put('/auth/me').set(session()).send({ username });
    expect(res.status).toBe(400);
  });

  it.each([['javascript:alert(1)'], ['ftp://example.com/a.png'], [`https://example.com/${'a'.repeat(500)}`]])(
    'rejects avatarUrl %j on PUT /auth/me and PUT /admin/users/:id',
    async (avatarUrl) => {
      const own = await request(app).put('/auth/me').set(session()).send({ avatarUrl });
      const byAdmin = await request(app).put('/admin/users/2').set(admin()).send({ avatarUrl });
      expect([own.status, byAdmin.status]).toEqual([400, 400]);
    },
  );

  it('answers 409 when the username is already taken', async () => {
    prismaMock.user.update.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
    const res = await request(app).put('/auth/me').set(session()).send({ username: 'user1' });
    expect(res.status).toBe(409);
  });

  it('accepts a valid username and an https avatar', async () => {
    const res = await request(app)
      .put('/auth/me')
      .set(session())
      .send({ username: 'New_Name-2', avatarUrl: 'https://cdn.example.com/a.png' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ username: 'New_Name-2', avatarUrl: 'https://cdn.example.com/a.png' });
  });
});
