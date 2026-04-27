import type { PrismaLike } from '@starvis/db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export interface JwtPayload {
  sub: number;
  uuid: string;
  email: string;
  username: string;
  role: string;
}

export interface PublicUser {
  id: number;
  uuid: string;
  email: string;
  username: string;
  role: string;
  avatarUrl: string | null;
  createdAt: Date;
}

const SALT_ROUNDS = 12;
const JWT_EXPIRES = '7d';
const JWT_API_TOKEN_EXPIRES = '1y';

function getSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET not set');
  return s;
}

function toPublicUser(u: {
  id: number;
  uuid: string;
  email: string;
  username: string;
  role: string;
  avatarUrl: string | null;
  createdAt: Date;
}): PublicUser {
  return { id: u.id, uuid: u.uuid, email: u.email, username: u.username, role: u.role, avatarUrl: u.avatarUrl, createdAt: u.createdAt };
}

export class AuthService {
  constructor(private prisma: PrismaLike) {}

  async register(email: string, username: string, password: string): Promise<{ token: string; user: PublicUser }> {
    const emailLower = email.toLowerCase().trim();
    const usernameTrimmed = username.trim();

    // Check uniqueness
    const existing = await (this.prisma as any).user.findFirst({
      where: { OR: [{ email: emailLower }, { username: usernameTrimmed }] },
    });
    if (existing) {
      if (existing.email === emailLower) throw new Error('EMAIL_TAKEN');
      throw new Error('USERNAME_TAKEN');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await (this.prisma as any).user.create({
      data: { email: emailLower, username: usernameTrimmed, passwordHash },
    });

    const token = this.signToken(user);
    return { token, user: toPublicUser(user) };
  }

  async login(emailOrUsername: string, password: string): Promise<{ token: string; user: PublicUser }> {
    const lower = emailOrUsername.toLowerCase().trim();
    const user = await (this.prisma as any).user.findFirst({
      where: { OR: [{ email: lower }, { username: lower }] },
    });
    if (!user) throw new Error('INVALID_CREDENTIALS');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new Error('INVALID_CREDENTIALS');

    const token = this.signToken(user);
    return { token, user: toPublicUser(user) };
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

  generateApiToken(user: PublicUser): string {
    const payload: JwtPayload = { sub: user.id, uuid: user.uuid, email: user.email, username: user.username, role: user.role };
    return jwt.sign(payload, getSecret(), { expiresIn: JWT_API_TOKEN_EXPIRES });
  }

  verifyToken(token: string): JwtPayload {
    return jwt.verify(token, getSecret()) as unknown as JwtPayload;
  }

  private signToken(user: { id: number; uuid: string; email: string; username: string; role: string }): string {
    const payload: JwtPayload = { sub: user.id, uuid: user.uuid, email: user.email, username: user.username, role: user.role };
    return jwt.sign(payload, getSecret(), { expiresIn: JWT_EXPIRES });
  }
}
