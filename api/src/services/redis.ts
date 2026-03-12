import { Redis } from 'ioredis';
import logger from '../utils/logger.js';
import { cacheCounter, cacheHitRateGauge } from './prometheus.js';

// Stats globales pour le cache
let cacheHits = 0;
let cacheMisses = 0;

/**
 * Configuration de la connexion Redis
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
  lazyConnect: true, // Ne pas se connecter immédiatement
};

/**
 * Client Redis singleton
 */
export const redis = new Redis(redisConfig);

// Flag pour savoir si Redis est disponible
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
 * Initialiser la connexion Redis (lazy connect)
 */
export async function initRedis(): Promise<boolean> {
  try {
    await redis.connect();
    redisAvailable = true;
    logger.info('Redis initialized successfully');
    return true;
  } catch (error) {
    logger.warn('Redis not available, cache disabled', { error });
    redisAvailable = false;
    return false;
  }
}

/**
 * Vérifie si Redis est disponible
 */
export function isRedisAvailable(): boolean {
  return redisAvailable;
}

/**
 * Cache TTL par défaut (1 heure)
 */
export const DEFAULT_TTL = 3600;

/**
 * TTL spécifiques par type de données
 */
export const CACHE_TTL = {
  SHIPS_LIST: 3600, // 1 heure
  SHIP_DETAIL: 3600, // 1 heure
  COMPONENTS_LIST: 3600, // 1 heure
  COMPONENT_DETAIL: 3600, // 1 heure
  FILTERS: 3600, // 1 heure
  MANUFACTURERS: 7200, // 2 heures (changent rarement)
  SHIP_MATRIX: 7200, // 2 heures
  LOADOUTS: 3600, // 1 heure
  SHOPS: 3600, // 1 heure
  CHANGELOG: 1800, // 30 minutes
};

/**
 * Wrapper générique pour get avec métriques
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
 * Wrapper générique pour set avec métriques
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
 * Invalider le cache par pattern
 */
export async function cacheInvalidatePattern(pattern: string): Promise<number> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      const result = await redis.del(...keys);
      cacheCounter.inc({ operation: 'invalidate', result: 'success' }, keys.length);
      logger.info(`Invalidated ${result} cache keys`, { pattern });
      return result;
    }
    return 0;
  } catch (error) {
    logger.error('Cache invalidate error', { pattern, error });
    cacheCounter.inc({ operation: 'invalidate', result: 'error' });
    return 0;
  }
}

/**
 * Invalider tout le cache
 */
export async function cacheFlush(): Promise<void> {
  try {
    await redis.flushdb();
    cacheCounter.inc({ operation: 'flush', result: 'success' });
    logger.info('Cache flushed');
  } catch (error) {
    logger.error('Cache flush error', { error });
    cacheCounter.inc({ operation: 'flush', result: 'error' });
  }
}

/**
 * Mise à jour du taux de hit du cache
 */
function updateCacheHitRate(): void {
  const total = cacheHits + cacheMisses;
  if (total > 0) {
    const hitRate = cacheHits / total;
    cacheHitRateGauge.set(hitRate);
  }
}

/**
 * Obtenir les stats du cache
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
 * Générer une clé de cache standardisée
 */
export function buildCacheKey(prefix: string, ...parts: (string | number | undefined)[]): string {
  const validParts = parts.filter((p) => p !== undefined && p !== null);
  return `starvis:${prefix}:${validParts.join(':')}`;
}
