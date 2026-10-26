import type { MetadataRoute } from 'next';
import { serverGet } from '@/lib/server-api';
import { PUBLIC_SITE_URL } from '@/lib/server-config';

export const revalidate = 86400; // 24 hours ISR

interface SitemapPayload {
  ships?: { uuid: string; extractedAt?: string | null }[];
  commodities?: { uuid: string; updatedAt?: string | null }[];
  locations?: { uuid: string; extractedAt?: string | null }[];
  commLinks?: { id: number; slug?: string | null; publishedAt?: string | null }[];
  galactapedia?: { id: string; slug?: string | null; updatedAt?: string | null }[];
  minerals?: { uuid: string }[];
  components?: { uuid: string; updatedAt?: string | null }[];
  items?: { uuid: string; updatedAt?: string | null }[];
}

const STATIC_ROUTES: {
  path: string;
  priority: number;
  changefreq: MetadataRoute.Sitemap[number]['changeFrequency'];
}[] = [
  // Hubs principaux
  { path: '/', priority: 1.0, changefreq: 'daily' },
  { path: '/explore', priority: 0.9, changefreq: 'daily' },

  // Base de données & Catalogues
  { path: '/ships', priority: 0.95, changefreq: 'daily' },
  { path: '/components', priority: 0.9, changefreq: 'weekly' },
  { path: '/items', priority: 0.9, changefreq: 'weekly' },
  { path: '/commodities', priority: 0.9, changefreq: 'daily' },
  { path: '/manufacturers', priority: 0.85, changefreq: 'monthly' },
  { path: '/locations', priority: 0.85, changefreq: 'weekly' },
  { path: '/shops', priority: 0.8, changefreq: 'monthly' },
  { path: '/vehicles', priority: 0.85, changefreq: 'weekly' },
  { path: '/paints', priority: 0.75, changefreq: 'weekly' },
  { path: '/blueprints', priority: 0.75, changefreq: 'weekly' },
  { path: '/ships-components', priority: 0.8, changefreq: 'weekly' },
  { path: '/loot', priority: 0.8, changefreq: 'weekly' },
  { path: '/missions', priority: 0.8, changefreq: 'weekly' },

  // Catégories FPS & Équipement
  { path: '/weapons', priority: 0.85, changefreq: 'weekly' },
  { path: '/armor', priority: 0.85, changefreq: 'weekly' },
  { path: '/utility', priority: 0.8, changefreq: 'weekly' },
  { path: '/sustenance', priority: 0.8, changefreq: 'weekly' },
  { path: '/clothing', priority: 0.8, changefreq: 'weekly' },
  { path: '/ammo', priority: 0.8, changefreq: 'weekly' },

  // Outils & calculateurs
  { path: '/trade', priority: 0.85, changefreq: 'weekly' },
  { path: '/trade-calculator', priority: 0.8, changefreq: 'weekly' },
  { path: '/mining', priority: 0.85, changefreq: 'weekly' },
  { path: '/mining-calculator', priority: 0.8, changefreq: 'weekly' },
  { path: '/crafting', priority: 0.8, changefreq: 'weekly' },
  { path: '/crafting-calculator', priority: 0.8, changefreq: 'weekly' },
  { path: '/fps-calculator', priority: 0.75, changefreq: 'monthly' },
  { path: '/compare', priority: 0.85, changefreq: 'weekly' },
  { path: '/ranking', priority: 0.8, changefreq: 'weekly' },

  // Lore & RSI
  { path: '/galactapedia', priority: 0.8, changefreq: 'weekly' },
  { path: '/comm-links', priority: 0.85, changefreq: 'daily' },
  { path: '/factions', priority: 0.75, changefreq: 'monthly' },

  // Portail & Documentation
  { path: '/developer', priority: 0.75, changefreq: 'monthly' },
  { path: '/changelog', priority: 0.85, changefreq: 'daily' },
  { path: '/roadmap', priority: 0.7, changefreq: 'weekly' },
  { path: '/about', priority: 0.7, changefreq: 'monthly' },
  { path: '/legal', priority: 0.3, changefreq: 'yearly' },
];

function entry(
  path: string,
  priority: number,
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'],
  lastModified?: string | Date | null,
): MetadataRoute.Sitemap[number] {
  return {
    url: `${PUBLIC_SITE_URL}${path}`,
    lastModified: lastModified ? new Date(lastModified) : new Date(),
    changeFrequency,
    priority,
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = STATIC_ROUTES.map(({ path, priority, changefreq }) => ({
    url: `${PUBLIC_SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: changefreq,
    priority,
  }));

  try {
    const data = await serverGet<SitemapPayload>('/system/sitemap-entries', { env: 'live' }, 86400);
    if (!data) return staticRoutes;

    const dynamicRoutes: MetadataRoute.Sitemap = [];

    if (Array.isArray(data.ships)) {
      for (const ship of data.ships) {
        if (ship.uuid) {
          dynamicRoutes.push(entry(`/ships/${encodeURIComponent(ship.uuid)}`, 0.75, 'weekly', ship.extractedAt));
        }
      }
    }

    if (Array.isArray(data.commodities)) {
      for (const comm of data.commodities) {
        if (comm.uuid) {
          dynamicRoutes.push(entry(`/commodities/${encodeURIComponent(comm.uuid)}`, 0.7, 'weekly', comm.updatedAt));
        }
      }
    }

    if (Array.isArray(data.locations)) {
      for (const loc of data.locations) {
        if (loc.uuid) {
          dynamicRoutes.push(entry(`/locations/${encodeURIComponent(loc.uuid)}`, 0.65, 'monthly', loc.extractedAt));
        }
      }
    }

    if (Array.isArray(data.minerals)) {
      for (const min of data.minerals) {
        if (min.uuid) {
          dynamicRoutes.push(entry(`/mining/${encodeURIComponent(min.uuid)}`, 0.6, 'weekly'));
        }
      }
    }

    if (Array.isArray(data.commLinks)) {
      for (const link of data.commLinks) {
        const idOrSlug = link.slug || String(link.id);
        if (idOrSlug) {
          dynamicRoutes.push(entry(`/comm-links/${encodeURIComponent(idOrSlug)}`, 0.7, 'daily', link.publishedAt));
        }
      }
    }

    if (Array.isArray(data.galactapedia)) {
      for (const entryItem of data.galactapedia) {
        const idOrSlug = entryItem.slug || entryItem.id;
        if (idOrSlug) {
          dynamicRoutes.push(entry(`/galactapedia/${encodeURIComponent(idOrSlug)}`, 0.65, 'weekly', entryItem.updatedAt));
        }
      }
    }

    if (Array.isArray(data.components)) {
      for (const comp of data.components) {
        if (comp.uuid) {
          dynamicRoutes.push(entry(`/components/${encodeURIComponent(comp.uuid)}`, 0.65, 'weekly', comp.updatedAt));
        }
      }
    }

    if (Array.isArray(data.items)) {
      for (const it of data.items) {
        if (it.uuid) {
          dynamicRoutes.push(entry(`/items/${encodeURIComponent(it.uuid)}`, 0.6, 'weekly', it.updatedAt));
        }
      }
    }

    return [...staticRoutes, ...dynamicRoutes];
  } catch {
    return staticRoutes;
  }
}
