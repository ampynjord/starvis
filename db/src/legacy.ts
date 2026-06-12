import { getPrisma, initPrisma, type PrismaClient } from './client/prisma.js';

/** @deprecated Use getPrisma() */
export function getStarvisPrisma(): PrismaClient {
  return getPrisma();
}

/** @deprecated Use getPrisma() */
export function getGamePrisma(_env?: string): PrismaClient {
  return getPrisma();
}

/** @deprecated Use getPrisma() */
export function getRsiWebsitePrisma(): PrismaClient {
  return getPrisma();
}

/**
 * @deprecated Use initPrisma(databaseUrl) instead.
 * Kept only so existing call sites compile; returns the new singleton client.
 */
export function initAllPrisma(urlBuilder: (db: string) => string): PrismaClient {
  return initPrisma(urlBuilder('starvis'));
}
