import { describe, expect, it } from 'vitest';
import { buildApiUrl } from '@/lib/server-api';

describe('buildApiUrl', () => {
  it('conserve le préfixe /api/v1 pour un chemin absolu', () => {
    // Régression : `new URL('/ships/x', base)` écrasait le chemin de la base et
    // produisait `/ships/x`, inexistant côté Express. Toutes les requêtes des
    // composants serveur (métadonnées, JSON-LD, extraits SEO) retombaient donc
    // silencieusement sur null.
    expect(buildApiUrl('/ships/abc')).toMatch(/\/api\/v1\/ships\/abc$/);
  });

  it('accepte aussi un chemin relatif', () => {
    expect(buildApiUrl('ships/abc')).toMatch(/\/api\/v1\/ships\/abc$/);
  });

  it('ajoute les paramètres non vides', () => {
    const url = new URL(buildApiUrl('/ships', { env: 'live', limit: 10, empty: '', missing: undefined }));
    expect(url.pathname).toMatch(/\/api\/v1\/ships$/);
    expect(url.searchParams.get('env')).toBe('live');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.has('empty')).toBe(false);
    expect(url.searchParams.has('missing')).toBe(false);
  });
});
