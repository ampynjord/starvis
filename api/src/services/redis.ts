import { Redis } from 'ioredis';
import logger from '../utils/logger.js';
import { cacheCounter, cacheHitRateGauge } from './prometheus.js';

// Global cache stats
let cacheHits = 0;
let cacheMisses = 0;

/**
 * Redis connection configuration
 */
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  retryStrategy: (times: number) => {
    // Stop retrying after 5 attempts
    if (times > 5) {
      logger.warn('Redis connection failed after 5 attempts, disabling cache');
      return null;
    }
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: false,
  lazyConnect: true, // Do not connect immediately
};

/**
 * Redis singleton client
 */
export const redis = new Redis(redisConfig);

// Flag to track Redis availability
let redisAvailable = false;

redis.on('connect', () => {
  logger.info('Redis client connected');
  redisAvailable = true;
});

redis.on('ready', () => {
  logger.info('Redis client ready');
  redisAvailable = true;
});

redis.on('error', (err: Error) => {
  logger.error('Redis client error', { error: err.message });
  redisAvailable = false;
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
  redisAvailable = false;
});

/**
 * Initialize the Redis connection (lazy connect)
 */
function isRedisAvailable(): boolean {
  return redisAvailable;
}

/**
 * Default cache TTL (1 hour)
 */
const DEFAULT_TTL = 3600;

/**
 * Per-data-type specific TTLs
 */
export const CACHE_TTL = {
  SHIPS_LIST: 3600, // 1 hour
  SHIP_DETAIL: 3600, // 1 hour
  COMPONENTS_LIST: 3600, // 1 hour
  COMPONENT_DETAIL: 3600, // 1 hour
  FILTERS: 3600, // 1 hour
  MANUFACTURERS: 7200, // 2 hours (rarely changes)
  SHIP_MATRIX: 7200, // 2 hours
  LOADOUTS: 3600, // 1 hour
  SHOPS: 3600, // 1 hour
  CHANGELOG: 1800, // 30 minutes
};

/**
 * Generic get wrapper with metrics
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!isRedisAvailable()) {
    return null;
  }

  try {
    const result = await redis.get(key);

    if (result) {
      cacheHits++;
      cacheCounter.inc({ operation: 'get', result: 'hit' });
      updateCacheHitRate();
      return JSON.parse(result) as T;
    }

    cacheMisses++;
    cacheCounter.inc({ operation: 'get', result: 'miss' });
    updateCacheHitRate();
    return null;
  } catch (error) {
    logger.error('Cache get error', { key, error });
    cacheCounter.inc({ operation: 'get', result: 'error' });
    return null;
  }
}

/**
 * Generic set wrapper with metrics
 */
export async function cacheSet<T>(key: string, value: T, ttl: number = DEFAULT_TTL): Promise<boolean> {
  if (!isRedisAvailable()) {
    return false;
  }

  try {
    const serialized = JSON.stringify(value);
    await redis.setex(key, ttl, serialized);
    cacheCounter.inc({ operation: 'set', result: 'success' });
    return true;
  } catch (error) {
    logger.error('Cache set error', { key, error });
    cacheCounter.inc({ operation: 'set', result: 'error' });
    return false;
  }
}

/**
 * Invalidate cache by pattern
 */
export async function cacheInvalidatePattern(pattern: string): Promise<number> {
  if (!isRedisAvailable()) {
    return 0;
  }

  try {
    let cursor = '0';
    let deletedCount = 0;
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        deletedCount += await redis.del(...keys);
      }
    } while (cursor !== '0');

    logger.debug('Cache pattern invalidated', { pattern, deletedCount });
    return deletedCount;
  } catch (error) {
    logger.error('Cache invalidate pattern error', { pattern, error });
    return 0;
  }
}

/**
 * Update cache hit rate metric
 */
function updateCacheHitRate(): void {
  const total = cacheHits + cacheMisses;
  if (total > 0) {
    const hitRate = cacheHits / total;
    cacheHitRateGauge.set(hitRate);
  }
}

/**
 * Get cache stats
 */
export function getCacheStats() {
  const total = cacheHits + cacheMisses;
  const hitRate = total > 0 ? (cacheHits / total) * 100 : 0;

  return {
    hits: cacheHits,
    misses: cacheMisses,
    total,
    hitRate: hitRate.toFixed(2),
  };
}

/**
 * Build a standardized cache key
 */
export function buildCacheKey(prefix: string, ...parts: (string | number | undefined)[]): string {
  const validParts = parts.filter((p) => p !== undefined && p !== null);
  return `starvis:${prefix}:${validParts.join(':')}`;
}
