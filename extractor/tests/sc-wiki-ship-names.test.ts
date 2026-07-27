import { afterEach, describe, expect, it, vi } from 'vitest';
import { classNameToWikiSlug, fetchWikiShipName, partitionByCollision } from '../src/services/sc-wiki-ship-names.js';

describe('classNameToWikiSlug', () => {
  it('reproduit l’indexation du wiki communautaire', () => {
    // Vérifié le 27/07/2026 : api.star-citizen.wiki répond sur ce slug.
    expect(classNameToWikiSlug('MRAI_Guardian_QI_Collector_Indust')).toBe('mrai-guardian-qi-collector-indust');
    expect(classNameToWikiSlug('ARGO_ATLS_GEO_Collector_Grad01')).toBe('argo-atls-geo-collector-grad01');
  });
});

describe('fetchWikiShipName', () => {
  const mockFetch = (impl: () => unknown) => {
    vi.stubGlobal('fetch', vi.fn(impl as never));
  };

  afterEach(() => vi.unstubAllGlobals());

  it('lit le nom retourné par le wiki', async () => {
    mockFetch(() => ({
      ok: true,
      json: async () => ({ data: { class_name: 'ARGO_ATLS_GEO_Collector_Grad01', name: 'ATLS Snowland Color' } }),
    }));
    await expect(fetchWikiShipName('ARGO_ATLS_GEO_Collector_Grad01')).resolves.toBe('ATLS Snowland Color');
  });

  it('accepte une réponse non enveloppée', async () => {
    mockFetch(() => ({ ok: true, json: async () => ({ class_name: 'X_Y', name: 'Quelque Chose' }) }));
    await expect(fetchWikiShipName('X_Y')).resolves.toBe('Quelque Chose');
  });

  it('se rabat sur game_name quand name manque', async () => {
    mockFetch(() => ({ ok: true, json: async () => ({ data: { class_name: 'X_Y', game_name: 'Mirai Quelque Chose' } }) }));
    await expect(fetchWikiShipName('X_Y')).resolves.toBe('Mirai Quelque Chose');
  });

  it('refuse une réponse portant un autre class_name', async () => {
    // Le slug a mené ailleurs : la réponse est bien formée mais ne concerne pas
    // le vaisseau demandé. L'accepter renommerait un vaisseau avec le nom d'un
    // autre — une erreur silencieuse et durable.
    mockFetch(() => ({ ok: true, json: async () => ({ data: { class_name: 'AUTRE_VAISSEAU', name: 'Pas le bon' } }) }));
    await expect(fetchWikiShipName('X_Y')).resolves.toBeNull();
  });

  it('renvoie null sur 404', async () => {
    mockFetch(() => ({ ok: false, status: 404, json: async () => ({}) }));
    await expect(fetchWikiShipName('INCONNU')).resolves.toBeNull();
  });

  it('renvoie null sur erreur réseau, sans propager', async () => {
    mockFetch(() => {
      throw new Error('ECONNREFUSED');
    });
    await expect(fetchWikiShipName('X_Y')).resolves.toBeNull();
  });

  it('ignore un nom vide', async () => {
    mockFetch(() => ({ ok: true, json: async () => ({ data: { class_name: 'X_Y', name: '   ' } }) }));
    await expect(fetchWikiShipName('X_Y')).resolves.toBeNull();
  });
});

describe('partitionByCollision', () => {
  const p = (uuid: string, proposedName: string, currentName = `interne-${uuid}`) => ({
    uuid,
    className: `CLS_${uuid}`,
    currentName,
    proposedName,
  });

  it('rejette deux propositions portant le même nom', () => {
    // Le cas réel : le wiki nomme « Corsair PYAM Exec » les variantes Military et
    // Stealth. Les appliquer rendrait deux vaisseaux indiscernables.
    const { applicable, rejected } = partitionByCollision([p('a', 'Corsair PYAM Exec'), p('b', 'Corsair PYAM Exec')], []);
    expect(applicable).toHaveLength(0);
    expect(rejected).toHaveLength(2);
  });

  it('rejette une proposition qui heurte le nom d’un vaisseau non renommé', () => {
    const { applicable, rejected } = partitionByCollision([p('a', 'Gladius')], [{ uuid: 'z', name: 'Gladius' }]);
    expect(applicable).toHaveLength(0);
    expect(rejected[0]?.uuid).toBe('a');
  });

  it('ne compte pas le nom que la proposition elle-même libère', () => {
    // Le vaisseau « a » s'appelle « Ancien » et devient « Nouveau » : son ancien
    // nom ne doit pas être retenu comme occupé, sinon aucun renommage ne
    // passerait jamais.
    const { applicable } = partitionByCollision([p('a', 'Nouveau', 'Ancien')], [{ uuid: 'a', name: 'Ancien' }]);
    expect(applicable).toHaveLength(1);
  });

  it('laisse passer des noms tous distincts', () => {
    const { applicable, rejected } = partitionByCollision(
      [p('a', 'Prospector Wikelo Work Special'), p('b', 'Dragonfly Star Kitten')],
      [{ uuid: 'z', name: 'Gladius' }],
    );
    expect(applicable).toHaveLength(2);
    expect(rejected).toHaveLength(0);
  });
});
