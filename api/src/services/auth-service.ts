import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import type { PrismaLike } from '@starvis/db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_2FA_PENDING_EXPIRES, JWT_API_TOKEN_EXPIRES, JWT_EXPIRES, RESET_TOKEN_TTL_MS } from '../utils/config.js';

const _require = createRequire(import.meta.url);

export interface JwtPayload {
  sub: number;
  uuid: string;
  email: string;
  username: string;
  role: string;
  type?: string;
}

export interface PublicUser {
  id: number;
  uuid: string;
  email: string;
  username: string;
  role: string;
  avatarUrl: string | null;
  createdAt: Date;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
}

const SALT_ROUNDS = 12;

function getSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET not set');
  return s;
}

function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

function toPublicUser(u: {
  id: number;
  uuid: string;
  email: string;
  username: string;
  role: string;
  avatarUrl: string | null;
  createdAt: Date;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
}): PublicUser {
  return {
    id: u.id,
    uuid: u.uuid,
    email: u.email,
    username: u.username,
    role: u.role,
    avatarUrl: u.avatarUrl,
    createdAt: u.createdAt,
    emailVerified: u.emailVerified,
    twoFactorEnabled: u.twoFactorEnabled,
  };
}

export class AuthService {
  constructor(private prisma: PrismaLike) {}

  async register(email: string, username: string, password: string): Promise<{ requiresVerification: true; email: string }> {
    const emailLower = email.toLowerCase().trim();
    const usernameTrimmed = username.trim();

    const existing = await (this.prisma as any).user.findFirst({
      where: { OR: [{ email: emailLower }, { username: usernameTrimmed }] },
    });
    if (existing) {
      if (existing.email === emailLower) throw new Error('EMAIL_TAKEN');
      throw new Error('USERNAME_TAKEN');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const verificationToken = generateToken();
    await (this.prisma as any).user.create({
      data: {
        email: emailLower,
        username: usernameTrimmed,
        passwordHash,
        emailVerified: false,
        verificationToken,
      },
    });

    return { requiresVerification: true, email: emailLower };
  }

  getVerificationToken(email: string): Promise<{ username: string; token: string } | null> {
    return (this.prisma as any).user
      .findUnique({ where: { email: email.toLowerCase().trim() }, select: { username: true, verificationToken: true } })
      .then((u: any) => (u?.verificationToken ? { username: u.username, token: u.verificationToken } : null));
  }

  async verifyEmail(token: string): Promise<{ token: string; user: PublicUser }> {
    const user = await (this.prisma as any).user.findFirst({
      where: { verificationToken: token },
    });
    if (!user) throw new Error('INVALID_TOKEN');

    const updated = await (this.prisma as any).user.update({
      where: { id: user.id },
      data: { emailVerified: true, verificationToken: null },
    });

    const sessionToken = this.signToken(updated);
    return { token: sessionToken, user: toPublicUser(updated) };
  }

  async login(
    emailOrUsername: string,
    password: string,
  ): Promise<{ token: string; user: PublicUser } | { requires2FA: true; pendingToken: string }> {
    const lower = emailOrUsername.toLowerCase().trim();
    const user = await (this.prisma as any).user.findFirst({
      where: { OR: [{ email: lower }, { username: lower }] },
    });
    if (!user) throw new Error('INVALID_CREDENTIALS');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new Error('INVALID_CREDENTIALS');

    if (!user.emailVerified) throw new Error('EMAIL_NOT_VERIFIED');

    if (user.twoFactorEnabled) {
      const pendingToken = jwt.sign({ sub: user.id, type: '2fa_pending' }, getSecret(), { expiresIn: JWT_2FA_PENDING_EXPIRES });
      return { requires2FA: true, pendingToken };
    }

    const token = this.signToken(user);
    return { token, user: toPublicUser(user) };
  }

  async verify2FA(pendingToken: string, code: string): Promise<{ token: string; user: PublicUser }> {
    let payload: any;
    try {
      payload = jwt.verify(pendingToken, getSecret());
    } catch {
      throw new Error('INVALID_TOKEN');
    }
    if (payload.type !== '2fa_pending') throw new Error('INVALID_TOKEN');

    const user = await (this.prisma as any).user.findUnique({ where: { id: payload.sub } });
    if (!user?.twoFactorEnabled || !user?.twoFactorSecret) throw new Error('INVALID_TOKEN');

    const { authenticator } = _require('otplib');
    const valid = authenticator.verify({ token: code, secret: user.twoFactorSecret });
    if (!valid) throw new Error('INVALID_2FA_CODE');

    const sessionToken = this.signToken(user);
    return { token: sessionToken, user: toPublicUser(user) };
  }

  async requestPasswordReset(email: string): Promise<{ username: string; token: string } | null> {
    const user = await (this.prisma as any).user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (!user) return null;

    const resetToken = generateToken();
    const resetTokenExpiry = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await (this.prisma as any).user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExpiry },
    });

    return { username: user.username, token: resetToken };
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await (this.prisma as any).user.findFirst({
      where: { resetToken: token },
    });
    if (!user) throw new Error('INVALID_TOKEN');
    if (!user.resetTokenExpiry || user.resetTokenExpiry < new Date()) throw new Error('TOKEN_EXPIRED');

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await (this.prisma as any).user.update({
      where: { id: user.id },
      data: { passwordHash, resetToken: null, resetTokenExpiry: null },
    });
  }

  async setup2FA(userId: number): Promise<{ secret: string; qrCodeUrl: string }> {
    const user = await (this.prisma as any).user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('USER_NOT_FOUND');

    const { authenticator } = _require('otplib');
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(user.email, 'Starvis', secret);

    await (this.prisma as any).user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret, twoFactorEnabled: false },
    });

    const QRCode = _require('qrcode');
    const qrCodeUrl: string = await QRCode.toDataURL(otpauth);

    return { secret, qrCodeUrl };
  }

  async enable2FA(userId: number, code: string): Promise<void> {
    const user = await (this.prisma as any).user.findUnique({ where: { id: userId } });
    if (!user?.twoFactorSecret) throw new Error('2FA_NOT_SETUP');

    const { authenticator } = _require('otplib');
    const valid = authenticator.verify({ token: code, secret: user.twoFactorSecret });
    if (!valid) throw new Error('INVALID_2FA_CODE');

    await (this.prisma as any).user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });
  }

  async disable2FA(userId: number, code: string): Promise<void> {
    const user = await (this.prisma as any).user.findUnique({ where: { id: userId } });
    if (!user?.twoFactorEnabled || !user?.twoFactorSecret) throw new Error('2FA_NOT_ENABLED');

    const { authenticator } = _require('otplib');
    const valid = authenticator.verify({ token: code, secret: user.twoFactorSecret });
    if (!valid) throw new Error('INVALID_2FA_CODE');

    await (this.prisma as any).user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
  }

  async me(userId: number): Promise<PublicUser | null> {
    const user = await (this.prisma as any).user.findUnique({ where: { id: userId } });
    return user ? toPublicUser(user) : null;
  }

  async updateProfile(userId: number, updates: { username?: string; avatarUrl?: string }): Promise<PublicUser> {
    const user = await (this.prisma as any).user.update({
      where: { id: userId },
      data: updates,
    });
    return toPublicUser(user);
  }

  async listUsers(): Promise<PublicUser[]> {
    const users = await (this.prisma as any).user.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return users.map(toPublicUser);
  }

  async setRole(userId: number, role: string): Promise<PublicUser> {
    const user = await (this.prisma as any).user.update({
      where: { id: userId },
      data: { role },
    });
    return toPublicUser(user);
  }

  async adminUpdateUser(userId: number, updates: { username?: string; email?: string; avatarUrl?: string }): Promise<PublicUser> {
    const data: Record<string, string> = {};
    if (updates.username !== undefined) data.username = updates.username.trim();
    if (updates.email !== undefined) data.email = updates.email.toLowerCase().trim();
    if (updates.avatarUrl !== undefined) data.avatarUrl = updates.avatarUrl;
    const user = await (this.prisma as any).user.update({ where: { id: userId }, data });
    return toPublicUser(user);
  }

  async adminResetPassword(userId: number, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await (this.prisma as any).user.update({ where: { id: userId }, data: { passwordHash } });
  }

  async deleteUser(userId: number): Promise<void> {
    await (this.prisma as any).user.delete({ where: { id: userId } });
  }

  async adminCreateUser(email: string, username: string, password: string, role = 'user'): Promise<PublicUser> {
    const emailLower = email.toLowerCase().trim();
    const usernameTrimmed = username.trim();
    const existing = await (this.prisma as any).user.findFirst({
      where: { OR: [{ email: emailLower }, { username: usernameTrimmed }] },
    });
    if (existing) {
      if (existing.email === emailLower) throw new Error('EMAIL_TAKEN');
      throw new Error('USERNAME_TAKEN');
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await (this.prisma as any).user.create({
      data: { email: emailLower, username: usernameTrimmed, passwordHash, role, emailVerified: true },
    });
    return toPublicUser(user);
  }

  generateApiToken(user: PublicUser): string {
    const payload: JwtPayload = {
      sub: user.id,
      uuid: user.uuid,
      email: user.email,
      username: user.username,
      role: user.role,
    };
    return jwt.sign(payload, getSecret(), { expiresIn: JWT_API_TOKEN_EXPIRES });
  }

  verifyToken(token: string): JwtPayload {
    return jwt.verify(token, getSecret()) as unknown as JwtPayload;
  }

  private signToken(user: { id: number; uuid: string; email: string; username: string; role: string }): string {
    const payload: JwtPayload = {
      sub: user.id,
      uuid: user.uuid,
      email: user.email,
      username: user.username,
      role: user.role,
    };
    return jwt.sign(payload, getSecret(), { expiresIn: JWT_EXPIRES });
  }
}
