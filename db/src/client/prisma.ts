import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/client/index.js';

let prismaClient: PrismaClient | null = null;

/**
 * Initialise the global Prisma client with the given DATABASE_URL.
 * Must be called once at startup before any other helper.
 */
export function initPrisma(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  prismaClient = new PrismaClient({ adapter });
  return prismaClient;
}

/** Return the singleton Prisma client (throws if not yet initialised). */
export function getPrisma(): PrismaClient {
  if (!prismaClient) throw new Error('PrismaClient not initialised - call initPrisma() first');
  return prismaClient;
}

export type { UserRole } from '../../generated/client/index.js';
export { PrismaClient };
