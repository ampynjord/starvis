import type { SeoEntityLink } from '@/components/seo/SeoEntitySnapshot';
import type {
  CommLink,
  Commodity,
  ComponentListItem,
  GalactapediaEntry,
  ItemListItem,
  Location,
  ShipListItem,
  StarmapPosition,
} from '@/types/api';
import { serverGetAllPaginated } from './server-api';
import { PUBLIC_SITE_URL } from './server-config';

const SNAPSHOT_LIMIT = 36;

function compact(parts: Array<string | number | null | undefined>): string | null {
  const text = parts.filter((part) => part !== null && part !== undefined && String(part).trim() !== '').join(' - ');
  return text || null;
}

export async function getShipSeoLinks(): Promise<SeoEntityLink[]> {
  const ships = await serverGetAllPaginated<ShipListItem>(
    '/ships',
    { env: 'live', variant_type: 'none', sort: 'name', order: 'asc' },
    { maxItems: SNAPSHOT_LIMIT },
  );
  return ships.map((ship) => ({
    href: `/ships/${ship.uuid}`,
    name: ship.name,
    meta: compact([ship.manufacturer_name, ship.career ?? ship.role]),
    description: compact([
      ship.scm_speed ? `${ship.scm_speed} m/s SCM` : null,
      ship.cargo_capacity != null ? `${ship.cargo_capacity} SCU cargo` : null,
      ship.max_crew ? `${ship.max_crew} crew` : null,
    ]),
  }));
}

export async function getComponentSeoLinks(): Promise<SeoEntityLink[]> {
  const components = await serverGetAllPaginated<ComponentListItem>(
    '/components',
    { env: 'live', sort: 'name', order: 'asc' },
    { maxItems: SNAPSHOT_LIMIT },
  );
  return components.map((component) => ({
    href: `/components/${component.uuid}`,
    name: component.name,
    meta: compact([component.manufacturer_name, component.type, component.sub_type, component.size ? `size ${component.size}` : null]),
    description: compact([
      component.weapon_dps ? `${Math.round(component.weapon_dps)} DPS` : null,
      component.shield_hp ? `${Math.round(component.shield_hp)} shield HP` : null,
      component.qd_speed ? `${Math.round(component.qd_speed)} quantum speed` : null,
    ]),
  }));
}

export async function getItemSeoLinks(): Promise<SeoEntityLink[]> {
  const items = await serverGetAllPaginated<ItemListItem>(
    '/items',
    { env: 'live', sort: 'name', order: 'asc' },
    { maxItems: SNAPSHOT_LIMIT },
  );
  return items.map((item) => ({
    href: `/items/${item.uuid}`,
    name: item.display_name ?? item.displayName ?? item.name,
    meta: compact([item.manufacturer_name, item.type, item.sub_type]),
    description: compact([
      item.weapon_dps ? `${Math.round(item.weapon_dps)} DPS` : null,
      item.armor_damage_reduction ? `${item.armor_damage_reduction}% damage reduction` : null,
      item.grade ? `grade ${item.grade}` : null,
    ]),
  }));
}

export async function getCommoditySeoLinks(): Promise<SeoEntityLink[]> {
  const commodities = await serverGetAllPaginated<Commodity>(
    '/commodities',
    { env: 'live', sort: 'name', order: 'asc' },
    { maxItems: SNAPSHOT_LIMIT },
  );
  return commodities.map((commodity) => ({
    href: `/commodities/${commodity.uuid}`,
    name: commodity.name,
    meta: compact([commodity.type, commodity.sub_type, commodity.symbol]),
    description: compact([commodity.occupancy_scu ? `${commodity.occupancy_scu} SCU occupancy` : null, commodity.class_name]),
  }));
}

export async function getCommLinkSeoLinks(): Promise<SeoEntityLink[]> {
  const links = await serverGetAllPaginated<CommLink>('/comm-links', {}, { maxItems: SNAPSHOT_LIMIT });
  return links.map((link) => ({
    href: `/comm-links/${link.slug || link.id}`,
    name: link.title,
    meta: compact([link.category, link.published_at ? new Date(link.published_at).toISOString().slice(0, 10) : null]),
    description: link.excerpt,
  }));
}

export async function getGalactapediaSeoLinks(): Promise<SeoEntityLink[]> {
  const entries = await serverGetAllPaginated<GalactapediaEntry>('/galactapedia', {}, { maxItems: SNAPSHOT_LIMIT });
  return entries.map((entry) => ({
    href: `/galactapedia/${entry.slug || entry.id}`,
    name: entry.title,
    meta: Array.isArray(entry.categories) ? entry.categories.slice(0, 2).join(', ') : entry.categories,
    description: entry.excerpt,
  }));
}

export async function getLocationSeoLinks(): Promise<SeoEntityLink[]> {
  const locations = await serverGetAllPaginated<Location>(
    '/locations',
    { env: 'live', hideInStarmap: 'false', sort: 'name', order: 'asc' },
    { maxItems: SNAPSHOT_LIMIT },
  );
  return locations.map((location) => ({
    href: `/locations?focus=${encodeURIComponent(location.uuid)}`,
    name: location.name,
    meta: compact([location.system_code, location.type]),
    description: location.description,
  }));
}

export async function getStarmapSeoLinks(): Promise<SeoEntityLink[]> {
  const positions = await serverGetAllPaginated<StarmapPosition>('/starmap/locations', {}, { maxItems: SNAPSHOT_LIMIT });
  return positions.map((position) => ({
    href: `/starmap?focus=${encodeURIComponent(position.rsi_id ?? String(position.id))}`,
    name: position.name,
    meta: compact([position.system_name, position.type, position.faction_name]),
    description: position.description,
  }));
}

export function collectionJsonLd(name: string, path: string, items: SeoEntityLink[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    url: `${PUBLIC_SITE_URL}${path}`,
    hasPart: items.slice(0, 24).map((item) => ({
      '@type': 'Thing',
      name: item.name,
      url: `${PUBLIC_SITE_URL}${item.href}`,
      description: item.description ?? item.meta ?? undefined,
    })),
  };
}
