import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Le cache doit suivre la donnée, pas l'horloge.
 *
 * Ces contrôles portent sur le comportement de la version, pas sur Redis : le
 * client est remplacé, si bien que le test dit ce qui arrive à la clé sans
 * qu'aucun serveur ne tourne.
 */
const store = new Map<string, string>();
const redisStub = {
  status: 'ready',
  get: vi.fn(async (key: string) => store.get(key) ?? null),
  setex: vi.fn(async (key: string, _ttl: number, value: string) => {
    store.set(key, value);
    return 'OK';
  }),
  scan: vi.fn(async () => ['0', []] as [string, string[]]),
  del: vi.fn(async () => 0),
  // Le module marque Redis disponible sur l'evenement « ready ». Le bouchon le
  // declenche a l'inscription, sinon toute lecture court-circuite avant meme
  // d'avoir construit une cle — et le test ne mesurerait rien.
  on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    if (event === 'ready' || event === 'connect') handler();
    return redisStub;
  }),
  connect: vi.fn(async () => undefined),
  quit: vi.fn(async () => 'OK'),
};

class RedisStub {
  constructor() {
    return redisStub as never;
  }
}

vi.mock('ioredis', () => ({ default: RedisStub, Redis: RedisStub }));

const { buildCacheKey, cacheGet, cacheSet, getDataVersion, setDataVersionResolver } = await import('../src/services/redis.js');

afterEach(() => {
  store.clear();
  setDataVersionResolver(null);
  vi.useRealTimers();
});

describe('cache versionné', () => {
  it('écrit sous la version courante et la relit', async () => {
    setDataVersionResolver(async () => 'abc123def456');
    await cacheSet(buildCacheKey('ship-matrix', 'all'), { ships: 3 }, 60);

    expect([...store.keys()]).toEqual(['abc123def456|starvis:ship-matrix:all']);
    await expect(cacheGet(buildCacheKey('ship-matrix', 'all'))).resolves.toEqual({ ships: 3 });
  });

  it('rend les anciennes clés inatteignables quand la donnée change', async () => {
    vi.useFakeTimers();
    let version = 'extraction-01';
    setDataVersionResolver(async () => version);

    const key = buildCacheKey('ship-matrix', 'all');
    await cacheSet(key, { ships: 3 }, 60);
    await expect(cacheGet(key)).resolves.toEqual({ ships: 3 });

    // Une extraction publie une nouvelle empreinte. La version n'est relue
    // qu'une fois par minute : sans avancer l'horloge, le cache resterait sur
    // l'ancienne — c'est le compromis assumé, et il se vérifie.
    version = 'extraction-02';
    await expect(cacheGet(key)).resolves.toEqual({ ships: 3 });

    vi.advanceTimersByTime(61_000);
    await expect(cacheGet(key)).resolves.toBeNull();
    // L'ancienne entrée n'est pas effacée : elle devient inatteignable et
    // s'efface seule à son TTL. Aucune suppression à orchestrer.
    expect(store.has('extraction-01|starvis:ship-matrix:all')).toBe(true);
  });

  it('garde la version précédente quand le résolveur échoue', async () => {
    vi.useFakeTimers();
    let failing = false;
    setDataVersionResolver(async () => {
      if (failing) throw new Error('base injoignable');
      return 'stable-version';
    });

    const key = buildCacheKey('ship-matrix', 'all');
    await cacheSet(key, { ships: 3 }, 60);
    expect(getDataVersion()).toBe('stable-version');

    // Une base injoignable doit dégrader le cache, jamais le faire servir sous
    // une version inventée — ce qui reviendrait à tout invalider au pire moment.
    failing = true;
    vi.advanceTimersByTime(61_000);
    await expect(cacheGet(key)).resolves.toEqual({ ships: 3 });
    expect(getDataVersion()).toBe('stable-version');
  });
});
