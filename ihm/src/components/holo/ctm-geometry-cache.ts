import type * as THREE from 'three';
import type { CTMLoader } from '@/lib/CTMLoader';

const geometryCache = new Map<string, Promise<THREE.BufferGeometry>>();

export function loadCachedGeometry(loader: CTMLoader, url: string): Promise<THREE.BufferGeometry> {
  let cached = geometryCache.get(url);
  if (!cached) {
    cached = new Promise((resolve, reject) => {
      loader.load(url, resolve, undefined, reject);
    });
    geometryCache.set(url, cached);
  }
  return cached.then((geometry) => geometry.clone());
}
