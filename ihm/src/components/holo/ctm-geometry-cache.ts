import type * as THREE from 'three';
import type { CTMLoader } from '@/lib/CTMLoader';

interface LoadOptions {
  optimizeGeometry?: boolean;
}

// Cache of in-flight / resolved geometry loads, keyed by model URL.
// Only successful loads stay cached: a rejected promise is evicted so a later
// scene rebuild can retry instead of leaving the ship permanently stuck on its
// flat fallback card (this happened when a burst of parallel model downloads
// tripped the API rate limiter / slow-down and the rejection was cached).
const geometryCache = new Map<string, Promise<THREE.BufferGeometry>>();

// A fleet can request dozens of 3D models at once. Loading them all in parallel
// hammers the rate-limited `/api` surface (burst limiter + slow-down), which made
// random ships fail and fall back to a flat thumbnail. Cap concurrency and retry
// transient failures so every ship that has a model eventually renders it.
const MAX_CONCURRENT = 4;
const MAX_ATTEMPTS = 4;

let active = 0;
const waiters: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiters.push(resolve));
}

function release(): void {
  const next = waiters.shift();
  if (next) {
    next();
    return;
  }
  active = Math.max(0, active - 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPermanentFailure(error: unknown): boolean {
  // A 404 means the ship genuinely has no 3D model — retrying is pointless.
  const message = String((error as { message?: string } | undefined)?.message ?? error);
  return /\b404\b/.test(message);
}

function makeScopedLoader(loader: CTMLoader, optimizeGeometry: boolean): CTMLoader {
  const scoped = new (loader.constructor as new (manager: THREE.LoadingManager) => CTMLoader)(loader.manager);
  scoped.setOptimizeGeometry(optimizeGeometry);
  scoped.setPath(loader.path);
  scoped.setResourcePath(loader.resourcePath);
  scoped.setRequestHeader(loader.requestHeader);
  scoped.setWithCredentials(loader.withCredentials);
  scoped.setCrossOrigin(loader.crossOrigin);
  return scoped;
}

function loadOnce(loader: CTMLoader, url: string, optimizeGeometry: boolean): Promise<THREE.BufferGeometry> {
  const scoped = makeScopedLoader(loader, optimizeGeometry);
  return new Promise((resolve, reject) => {
    scoped.load(url, resolve, undefined, reject);
  });
}

async function loadWithRetry(loader: CTMLoader, url: string, optimizeGeometry: boolean): Promise<THREE.BufferGeometry> {
  await acquire();
  try {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await loadOnce(loader, url, optimizeGeometry);
      } catch (error) {
        lastError = error;
        if (isPermanentFailure(error) || attempt === MAX_ATTEMPTS - 1) break;
        // Back off before retrying a transient failure (rate limit / network).
        await sleep(500 * 2 ** attempt);
      }
    }
    throw lastError;
  } finally {
    release();
  }
}

export function loadCachedGeometry(loader: CTMLoader, url: string, options: LoadOptions = {}): Promise<THREE.BufferGeometry> {
  const optimizeGeometry = options.optimizeGeometry ?? true;
  const cacheKey = `${optimizeGeometry ? 'smooth' : 'fast'}:${url}`;
  let cached = geometryCache.get(cacheKey);
  if (!cached) {
    cached = loadWithRetry(loader, url, optimizeGeometry).then((geometry) => {
      geometry.userData.starvisSharedGeometry = true;
      return geometry;
    });
    // Evict failed loads so a later rebuild can retry rather than staying stuck.
    cached.catch(() => {
      if (geometryCache.get(cacheKey) === cached) geometryCache.delete(cacheKey);
    });
    geometryCache.set(cacheKey, cached);
  }
  return cached;
}
