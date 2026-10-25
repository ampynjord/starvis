import { describe, expect, it, vi } from 'vitest';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import * as serverApi from '@/lib/server-api';

describe('robots()', () => {
  it('définit les règles robots avec le sitemap canonique', () => {
    const config = robots();
    expect(config.sitemap).toMatch(/https:\/\/starvis\.ampynjord\.bzh\/sitemap\.xml$/);
    const rules = Array.isArray(config.rules) ? config.rules[0] : config.rules;
    expect(rules.allow).toBe('/');
    expect(rules.disallow).toContain('/admin');
    expect(rules.disallow).toContain('/login');
    expect(rules.disallow).toContain('/api/');
  });
});

describe('sitemap()', () => {
  it('génère un ensemble d’URLs valide avec les routes statiques clés', async () => {
    // Simuler l’absence de réponse API pour vérifier le repli de sécurité statique
    vi.spyOn(serverApi, 'serverGet').mockResolvedValueOnce(null);

    const entries = await sitemap();
    expect(entries.length).toBeGreaterThanOrEqual(30);

    const urls = entries.map((e) => e.url);
    expect(urls).toContain('https://starvis.ampynjord.bzh/');
    expect(urls).toContain('https://starvis.ampynjord.bzh/ships');
    expect(urls).toContain('https://starvis.ampynjord.bzh/components');
    expect(urls).toContain('https://starvis.ampynjord.bzh/items');
    expect(urls).toContain('https://starvis.ampynjord.bzh/commodities');
    expect(urls).toContain('https://starvis.ampynjord.bzh/trade');
    expect(urls).toContain('https://starvis.ampynjord.bzh/mining');
    expect(urls).toContain('https://starvis.ampynjord.bzh/compare');
    expect(urls).toContain('https://starvis.ampynjord.bzh/changelog');
    expect(urls).toContain('https://starvis.ampynjord.bzh/legal');

    for (const item of entries) {
      expect(item.url).toMatch(/^https:\/\/starvis\.ampynjord\.bzh\//);
      expect(item.priority).toBeGreaterThan(0);
      expect(item.priority).toBeLessThanOrEqual(1.0);
      expect(item.lastModified).toBeInstanceOf(Date);
    }
  });

  it('intègre les entités dynamiques retournées par l’API', async () => {
    vi.spyOn(serverApi, 'serverGet').mockResolvedValueOnce({
      ships: [{ uuid: 'ship-uuid-1', extractedAt: '2026-10-25T12:00:00Z' }],
      commodities: [{ uuid: 'comm-uuid-1', updatedAt: '2026-10-25T12:00:00Z' }],
      locations: [{ uuid: 'loc-uuid-1', extractedAt: '2026-10-25T12:00:00Z' }],
      minerals: [{ uuid: 'min-uuid-1' }],
      commLinks: [{ id: 42, slug: 'transmission-test', publishedAt: '2026-10-25T12:00:00Z' }],
      galactapedia: [{ id: 'gal-1', slug: 'entry-lore', updatedAt: '2026-10-25T12:00:00Z' }],
      components: [{ uuid: 'comp-uuid-1', updatedAt: '2026-10-25T12:00:00Z' }],
      items: [{ uuid: 'item-uuid-1', updatedAt: '2026-10-25T12:00:00Z' }],
    });

    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toContain('https://starvis.ampynjord.bzh/ships/ship-uuid-1');
    expect(urls).toContain('https://starvis.ampynjord.bzh/commodities/comm-uuid-1');
    expect(urls).toContain('https://starvis.ampynjord.bzh/locations/loc-uuid-1');
    expect(urls).toContain('https://starvis.ampynjord.bzh/mining/min-uuid-1');
    expect(urls).toContain('https://starvis.ampynjord.bzh/comm-links/transmission-test');
    expect(urls).toContain('https://starvis.ampynjord.bzh/galactapedia/entry-lore');
    expect(urls).toContain('https://starvis.ampynjord.bzh/components/comp-uuid-1');
    expect(urls).toContain('https://starvis.ampynjord.bzh/items/item-uuid-1');
  });
});
