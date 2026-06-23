import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { redis, cacheGet, cacheSet, cacheInvalidatePattern } from '../src/services/redis.js';

describe('Redis cache services', () => {
  beforeAll(async () => {
    if (redis.status === 'wait') {
      await redis.connect().catch(() => {});
    }
    if (redis.status !== 'ready') {
      await new Promise<void>((resolve) => {
        redis.once('ready', () => resolve());
      });
    }
  });

  afterAll(async () => {
    // Clean up test keys
    const keys = await redis.keys('starvis:test:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  it('can set, get and invalidate keys by pattern', async () => {
    await cacheSet('starvis:test:foo', { value: 'bar' }, 10);
    await cacheSet('starvis:test:baz', { value: 'qux' }, 10);
    await cacheSet('starvis:other:key', { value: 'keep' }, 10);

    // Verify they are set
    expect(await cacheGet('starvis:test:foo')).toEqual({ value: 'bar' });
    expect(await cacheGet('starvis:test:baz')).toEqual({ value: 'qux' });
    expect(await cacheGet('starvis:other:key')).toEqual({ value: 'keep' });

    // Invalidate pattern
    const deletedCount = await cacheInvalidatePattern('starvis:test:*');
    expect(deletedCount).toBeGreaterThanOrEqual(2);

    // Verify invalidation
    expect(await cacheGet('starvis:test:foo')).toBeNull();
    expect(await cacheGet('starvis:test:baz')).toBeNull();
    expect(await cacheGet('starvis:other:key')).toEqual({ value: 'keep' });

    // Clean up last key
    await redis.del('starvis:other:key');
  });
});
