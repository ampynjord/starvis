import type { MetadataRoute } from 'next';
import { serverGetAllPaginated } from '@/lib/server-api';
import { PUBLIC_SITE_URL } from '@/lib/server-config';
import type { CommLink, Commodity, ComponentListItem, GalactapediaEntry, ItemListItem, Location, ShipListItem } from '@/types/api';

export const revalidate = 3600;
export const dynamic = 'force-dynamic';

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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticRoutes = STATIC_ROUTES.map(({ path, priority, changefreq }) => ({
    url: `${PUBLIC_SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: changefreq,
    priority,
  }));

  const dynamicRoutes = await generateDynamicSitemapEntries();
  return [...staticRoutes, ...dynamicRoutes];
}

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

export async function generateDynamicSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const [ships, components, items, commodities, commLinks, galactapedia, locations] = await Promise.all([
    serverGetAllPaginated<ShipListItem>('/ships', { env: 'live', variant_type: 'none', sort: 'name', order: 'asc' }, { maxItems: 2500 }),
    serverGetAllPaginated<ComponentListItem>('/components', { env: 'live', sort: 'name', order: 'asc' }, { maxItems: 5000 }),
    serverGetAllPaginated<ItemListItem>('/items', { env: 'live', sort: 'name', order: 'asc' }, { maxItems: 5000 }),
    serverGetAllPaginated<Commodity>('/commodities', { env: 'live', sort: 'name', order: 'asc' }, { maxItems: 3000 }),
    serverGetAllPaginated<CommLink>('/comm-links', {}, { maxItems: 5000 }),
    serverGetAllPaginated<GalactapediaEntry>('/galactapedia', {}, { maxItems: 5000 }),
    serverGetAllPaginated<Location>('/locations', { env: 'live', hideInStarmap: 'false', sort: 'name', order: 'asc' }, { maxItems: 5000 }),
  ]);

  return [
    ...ships.map((ship) => entry(`/ships/${encodeURIComponent(ship.uuid)}`, 0.72, 'weekly')),
    ...components.map((component) => entry(`/components/${encodeURIComponent(component.uuid)}`, 0.62, 'weekly')),
    ...items.map((item) => entry(`/items/${encodeURIComponent(item.uuid)}`, 0.58, 'weekly')),
    ...commodities.map((commodity) => entry(`/commodities/${encodeURIComponent(commodity.uuid)}`, 0.56, 'weekly')),
    ...commLinks.map((link) => entry(`/comm-links/${encodeURIComponent(link.slug || String(link.id))}`, 0.66, 'daily', link.published_at)),
    ...galactapedia.map((item) => entry(`/galactapedia/${encodeURIComponent(item.slug || item.id)}`, 0.56, 'weekly', item.updated_at)),
    ...locations.map((location) => entry(`/locations?focus=${encodeURIComponent(location.uuid)}`, 0.48, 'monthly')),
  ];
}
