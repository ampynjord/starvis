import type { PrismaClient } from '../client/prisma.js';

/** Minimal interface covering the raw-SQL methods used across all services. */
export interface PrismaLike {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $disconnect(): Promise<void>;
}

/** @deprecated Use PrismaClient directly. */
export type GamePrismaClient = PrismaClient;
/** @deprecated Use PrismaClient directly. */
export type RsiPrismaClient = PrismaClient;
/** @deprecated Use PrismaClient directly. */
export type StarvisPrismaClient = PrismaClient;
