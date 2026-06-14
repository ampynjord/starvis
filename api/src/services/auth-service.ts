import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { PrismaClient, UserRole } from '@starvis/db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import { JWT_2FA_PENDING_EXPIRES, JWT_API_TOKEN_EXPIRES, JWT_EXPIRES, RESET_TOKEN_TTL_MS } from '../utils/config.js';
import { ApiTokenService, apiTokenExpiryFromNow, normalizeApiTokenDescription, normalizeApiTokenName } from './api-token-service.js';

export interface JwtPayload {
  sub: number;
  uuid: string;
  email: string;
  username: string;
  role: string;
  type?: string;
  jti?: string;
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

export type ApiAccessRequestStatus = 'pending' | 'approved' | 'rejected';

export interface ApiAccessRequestPublic {
  id: number;
  userId: number;
  motivation: string;
  status: string;
  adminNote: string | null;
  reviewedById: number | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user?: {
    id: number;
    uuid: string;
    username: string;
    email: string;
    role: string;
  };
  reviewedBy?: {
    id: number;
    username: string;
  } | null;
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

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function getEncryptionKey(): Buffer {
  const secret = process.env.TWO_FACTOR_ENCRYPTION_KEY || getSecret();
  return createHash('sha256').update(secret, 'utf8').digest();
}

function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

function decryptSecret(value: string): string {
  if (!value.startsWith('enc:v1:')) return value;
  const [, , ivRaw, tagRaw, ciphertextRaw] = value.split(':');
  if (!ivRaw || !tagRaw || !ciphertextRaw) throw new Error('INVALID_2FA_SECRET');
  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, 'base64url')), decipher.final()]).toString('utf8');
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

/** Subset of the Prisma client required by the auth layer. */
export type AuthDb = Pick<PrismaClient, '$transaction' | 'apiToken' | 'externalApiAccessRequest' | 'user'>;

/** Verify a Starvis JWT and return its payload. Throws on invalid/expired tokens. */
export function verifyAuthToken(token: string): JwtPayload {
  return jwt.verify(token, getSecret()) as unknown as JwtPayload;
}

export class AuthService {
  constructor(private prisma: AuthDb) {}

  async register(
    email: string,
    username: string,
    password: string,
  ): Promise<{ requiresVerification: true; email: string; verificationToken: string }> {
    const emailLower = email.toLowerCase().trim();
    const usernameTrimmed = username.trim();

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: emailLower }, { username: usernameTrimmed }] },
    });
    if (existing) {
      if (existing.email === emailLower) throw new Error('EMAIL_TAKEN');
      throw new Error('USERNAME_TAKEN');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const verificationToken = generateToken();
    const verificationTokenHash = hashToken(verificationToken);
    await this.prisma.user.create({
      data: {
        email: emailLower,
        username: usernameTrimmed,
        passwordHash,
        emailVerified: false,
        verificationToken: verificationTokenHash,
      },
    });

    return { requiresVerification: true, email: emailLower, verificationToken };
  }

  /**
   * Compatibility helper for legacy plaintext tokens. Newly created
   * verification tokens are stored hashed and cannot be read back in clear text.
   */
  getVerificationToken(email: string): Promise<{ username: string; token: string } | null> {
    return this.prisma.user
      .findUnique({ where: { email: email.toLowerCase().trim() }, select: { username: true, verificationToken: true } })
      .then((u) => (u?.verificationToken ? { username: u.username, token: u.verificationToken } : null));
  }

  async verifyEmail(token: string): Promise<{ token: string; user: PublicUser }> {
    const tokenHash = hashToken(token);
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ verificationToken: tokenHash }, { verificationToken: token }] },
    });
    if (!user) throw new Error('INVALID_TOKEN');
    const verificationAgeMs = Date.now() - new Date(user.createdAt).getTime();
    if (verificationAgeMs > 48 * 60 * 60 * 1000) throw new Error('INVALID_TOKEN');

    const updated = await this.prisma.user.update({
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
    const user = await this.prisma.user.findFirst({
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

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user?.twoFactorEnabled || !user?.twoFactorSecret) throw new Error('INVALID_TOKEN');

    const result = await verify({ token: code, secret: decryptSecret(user.twoFactorSecret) });
    if (!result.valid) throw new Error('INVALID_2FA_CODE');

    const sessionToken = this.signToken(user);
    return { token: sessionToken, user: toPublicUser(user) };
  }

  async requestPasswordReset(email: string): Promise<{ username: string; token: string } | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (!user) return null;

    const resetToken = generateToken();
    const resetTokenHash = hashToken(resetToken);
    const resetTokenExpiry = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetToken: resetTokenHash, resetTokenExpiry },
    });

    return { username: user.username, token: resetToken };
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(token);
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ resetToken: tokenHash }, { resetToken: token }] },
    });
    if (!user) throw new Error('INVALID_TOKEN');
    if (!user.resetTokenExpiry || user.resetTokenExpiry < new Date()) throw new Error('TOKEN_EXPIRED');

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetToken: null, resetTokenExpiry: null },
    });
  }

  async setup2FA(userId: number): Promise<{ secret: string; qrCodeUrl: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('USER_NOT_FOUND');

    const secret = generateSecret();
    const otpauth = generateURI({ issuer: 'Starvis', label: user.email, secret });

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: encryptSecret(secret), twoFactorEnabled: false },
    });

    const qrCodeUrl: string = await QRCode.toDataURL(otpauth);

    return { secret, qrCodeUrl };
  }

  async enable2FA(userId: number, code: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.twoFactorSecret) throw new Error('2FA_NOT_SETUP');

    const result = await verify({ token: code, secret: decryptSecret(user.twoFactorSecret) });
    if (!result.valid) throw new Error('INVALID_2FA_CODE');

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });
  }

  async disable2FA(userId: number, code: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.twoFactorEnabled || !user?.twoFactorSecret) throw new Error('2FA_NOT_ENABLED');

    const result = await verify({ token: code, secret: decryptSecret(user.twoFactorSecret) });
    if (!result.valid) throw new Error('INVALID_2FA_CODE');

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
  }

  async me(userId: number): Promise<PublicUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user ? toPublicUser(user) : null;
  }

  async updateProfile(userId: number, updates: { username?: string; avatarUrl?: string }): Promise<PublicUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: updates,
    });
    return toPublicUser(user);
  }

  async listUsers(): Promise<PublicUser[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return users.map(toPublicUser);
  }

  async setRole(userId: number, role: UserRole): Promise<PublicUser> {
    const user = await this.prisma.user.update({
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
    const user = await this.prisma.user.update({ where: { id: userId }, data });
    return toPublicUser(user);
  }

  async adminResetPassword(userId: number, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  async deleteUser(userId: number): Promise<void> {
    await this.prisma.user.delete({ where: { id: userId } });
  }

  async getLatestApiAccessRequest(userId: number): Promise<ApiAccessRequestPublic | null> {
    return this.prisma.externalApiAccessRequest.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createApiAccessRequest(userId: number, motivation: unknown): Promise<ApiAccessRequestPublic> {
    if (typeof motivation !== 'string') throw new Error('INVALID_MOTIVATION');
    const trimmed = motivation.trim().replace(/\r\n/g, '\n');
    if (trimmed.length < 40) throw new Error('MOTIVATION_TOO_SHORT');
    if (trimmed.length > 2000) throw new Error('MOTIVATION_TOO_LONG');

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user) throw new Error('USER_NOT_FOUND');
    if (user.role === 'developer' || user.role === 'admin') throw new Error('ALREADY_HAS_ACCESS');

    const pending = await this.prisma.externalApiAccessRequest.findFirst({
      where: { userId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    if (pending) throw new Error('PENDING_REQUEST_EXISTS');

    return this.prisma.externalApiAccessRequest.create({
      data: {
        userId,
        motivation: trimmed,
        status: 'pending',
      },
    });
  }

  async listApiAccessRequests(status?: string): Promise<ApiAccessRequestPublic[]> {
    const safeStatus = ['pending', 'approved', 'rejected'].includes(String(status)) ? String(status) : undefined;
    return this.prisma.externalApiAccessRequest.findMany({
      where: safeStatus ? { status: safeStatus } : undefined,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        user: { select: { id: true, uuid: true, username: true, email: true, role: true } },
        reviewedBy: { select: { id: true, username: true } },
      },
    });
  }

  async reviewApiAccessRequest(
    id: number,
    reviewerId: number,
    status: ApiAccessRequestStatus,
    adminNote?: unknown,
  ): Promise<ApiAccessRequestPublic> {
    if (!['approved', 'rejected'].includes(status)) throw new Error('INVALID_STATUS');
    const note = typeof adminNote === 'string' ? adminNote.trim().slice(0, 2000) : null;

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.externalApiAccessRequest.update({
        where: { id },
        data: {
          status,
          adminNote: note || null,
          reviewedById: reviewerId,
          reviewedAt: new Date(),
        },
        include: {
          user: { select: { id: true, uuid: true, username: true, email: true, role: true } },
          reviewedBy: { select: { id: true, username: true } },
        },
      });

      if (status === 'approved' && request.user.role !== 'admin') {
        await tx.user.update({ where: { id: request.userId }, data: { role: 'developer' } });
        request.user.role = 'developer';
      }

      return request;
    });
  }

  async adminCreateUser(email: string, username: string, password: string, role: UserRole = 'user'): Promise<PublicUser> {
    const emailLower = email.toLowerCase().trim();
    const usernameTrimmed = username.trim();
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: emailLower }, { username: usernameTrimmed }] },
    });
    if (existing) {
      if (existing.email === emailLower) throw new Error('EMAIL_TAKEN');
      throw new Error('USERNAME_TAKEN');
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email: emailLower, username: usernameTrimmed, passwordHash, role, emailVerified: true },
    });
    return toPublicUser(user);
  }

  async generateApiToken(
    user: PublicUser,
    options?: { name?: string | null; description?: string | null },
  ): Promise<{ token: string; tokenId: number; name: string; expiresAt: Date }> {
    const jti = generateToken(16);
    const payload: JwtPayload = {
      sub: user.id,
      uuid: user.uuid,
      email: user.email,
      username: user.username,
      role: user.role,
      type: 'api_token',
      jti,
    };
    const token = jwt.sign(payload, getSecret(), { expiresIn: JWT_API_TOKEN_EXPIRES });
    const name = normalizeApiTokenName(options?.name);
    const row = await new ApiTokenService(this.prisma).create({
      jti,
      token,
      name,
      description: normalizeApiTokenDescription(options?.description),
      userId: user.id,
      roleSnapshot: user.role as UserRole,
      expiresAt: apiTokenExpiryFromNow(JWT_API_TOKEN_EXPIRES as string | number),
    });
    return { token, tokenId: row.id, name, expiresAt: row.expiresAt };
  }

  verifyToken(token: string): JwtPayload {
    return verifyAuthToken(token);
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
