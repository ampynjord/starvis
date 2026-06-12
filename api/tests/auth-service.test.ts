import { generate } from 'otplib';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../src/services/auth-service.js';

function makePrismaUser() {
  const user = {
    id: 1,
    uuid: 'user-uuid',
    email: 'pilot@example.com',
    username: 'pilot',
    role: 'user',
    avatarUrl: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    emailVerified: true,
    twoFactorEnabled: false,
    twoFactorSecret: null as string | null,
  };

  return {
    user,
    prisma: {
      user: {
        findUnique: async ({ where }: { where: { id?: number } }) => (where.id === user.id ? user : null),
        update: async ({ data }: { data: Partial<typeof user> }) => {
          Object.assign(user, data);
          return user;
        },
      },
    },
  };
}

describe('AuthService 2FA', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
    process.env.TWO_FACTOR_ENCRYPTION_KEY = 'test-2fa-secret-at-least-32-characters-long';
  });

  it('sets up, enables and disables TOTP 2FA', async () => {
    const { prisma, user } = makePrismaUser();
    const service = new AuthService(prisma as any);

    const setup = await service.setup2FA(user.id);

    expect(setup.secret).toBeTruthy();
    expect(setup.qrCodeUrl).toMatch(/^data:image\/png;base64,/);
    expect(user.twoFactorEnabled).toBe(false);
    expect(user.twoFactorSecret).toMatch(/^enc:v1:/);
    expect(user.twoFactorSecret).not.toBe(setup.secret);

    const enableCode = await generate({ secret: setup.secret });
    await service.enable2FA(user.id, enableCode);
    expect(user.twoFactorEnabled).toBe(true);

    const disableCode = await generate({ secret: setup.secret });
    await service.disable2FA(user.id, disableCode);
    expect(user.twoFactorEnabled).toBe(false);
    expect(user.twoFactorSecret).toBeNull();
  });
});
