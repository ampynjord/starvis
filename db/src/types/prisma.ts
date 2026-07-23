/** Minimal interface covering the raw-SQL methods used across all services. */
export interface PrismaLike {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $disconnect(): Promise<void>;
}
