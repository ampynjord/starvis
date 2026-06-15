import type { MetadataRoute } from 'next';
import { PUBLIC_SITE_URL } from '@/lib/server-config';

const STATIC_ROUTES: { path: string; priority: number; changefreq: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
  { path: '/', priority: 1.0, changefreq: 'daily' },
  { path: '/about', priority: 0.8, changefreq: 'monthly' },
  { path: '/ai', priority: 0.8, changefreq: 'weekly' },
  { path: '/roadmap', priority: 0.7, changefreq: 'weekly' },
  { path: '/ships', priority: 0.9, changefreq: 'weekly' },
  { path: '/vehicles', priority: 0.8, changefreq: 'weekly' },
  { path: '/compare', priority: 0.7, changefreq: 'monthly' },
  { path: '/ranking', priority: 0.7, changefreq: 'weekly' },
  { path: '/loadout-manager', priority: 0.7, changefreq: 'weekly' },
  { path: '/armor', priority: 0.7, changefreq: 'weekly' },
  { path: '/clothing', priority: 0.7, changefreq: 'weekly' },
  { path: '/weapons', priority: 0.7, changefreq: 'weekly' },
  { path: '/utility', priority: 0.7, changefreq: 'weekly' },
  { path: '/ammo', priority: 0.7, changefreq: 'weekly' },
  { path: '/sustenance', priority: 0.7, changefreq: 'weekly' },
  { path: '/commodities', priority: 0.7, changefreq: 'weekly' },
  { path: '/fps-calculator', priority: 0.7, changefreq: 'weekly' },
  { path: '/mining-calculator', priority: 0.7, changefreq: 'weekly' },
  { path: '/trade-calculator', priority: 0.7, changefreq: 'weekly' },
  { path: '/crafting-calculator', priority: 0.7, changefreq: 'weekly' },
  { path: '/locations', priority: 0.7, changefreq: 'weekly' },
  { path: '/starmap', priority: 0.7, changefreq: 'weekly' },
  { path: '/missions', priority: 0.7, changefreq: 'weekly' },
  { path: '/factions', priority: 0.6, changefreq: 'monthly' },
  { path: '/manufacturers', priority: 0.6, changefreq: 'monthly' },
  { path: '/galactapedia', priority: 0.6, changefreq: 'weekly' },
  { path: '/comm-links', priority: 0.6, changefreq: 'daily' },
  { path: '/changelog', priority: 0.8, changefreq: 'daily' },
  { path: '/discord', priority: 0.7, changefreq: 'weekly' },
  { path: '/developer', priority: 0.5, changefreq: 'monthly' },
  { path: '/legal', priority: 0.3, changefreq: 'yearly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return STATIC_ROUTES.map(({ path, priority, changefreq }) => ({
    url: `${PUBLIC_SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: changefreq,
    priority,
  }));
}
