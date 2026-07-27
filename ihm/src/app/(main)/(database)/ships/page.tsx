import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SeoEntitySnapshot, SeoJsonLd } from '@/components/seo/SeoEntitySnapshot';
import { collectionJsonLd, getShipSeoLinks } from '@/lib/seo-snapshots';
import { serverGetPaginated } from '@/lib/server-api';
import {
  DEFAULT_SHIP_ORDER,
  DEFAULT_SHIP_SORT,
  resolveShipCategory,
  shipListPath,
  SHIPS_LIST_LIMIT,
} from '@/lib/ships-list';
import type { ShipListItem } from '@/types/api';
import ShipsPage from '@/views/ShipsPage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ships & Vehicles',
  description:
    'Browse the complete list of Star Citizen ships and vehicles with detailed stats, 3D hologram viewer, variants and hardpoints. Data extracted directly from game files.',
  keywords: ['star citizen ships', 'star citizen vehicles', 'sc ship list', 'star citizen ship stats', 'star citizen ship database'],
  alternates: { canonical: '/ships' },
  openGraph: {
    title: 'Ships & Vehicles - STARVIS',
    description: 'Complete Star Citizen ship database with stats, 3D hologram and comparisons.',
  },
};

export default async function Page({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const { cat } = await searchParams;
  const category = resolveShipCategory(cat);

  const [links, initialList] = await Promise.all([
    getShipSeoLinks(),
    serverGetPaginated<ShipListItem>(shipListPath(category), {
      env: 'live',
      page: 1,
      limit: SHIPS_LIST_LIMIT,
      sort: DEFAULT_SHIP_SORT,
      order: DEFAULT_SHIP_ORDER,
    }),
  ]);

  return (
    <>
      <SeoJsonLd value={collectionJsonLd('Star Citizen Ships and Vehicles', '/ships', links)} />
      <Suspense>
        <ShipsPage initialList={initialList} />
      </Suspense>
      <SeoEntitySnapshot
        title="Indexable Star Citizen ship database"
        description="Crawlable STARVIS ship entries with manufacturers, roles and key stats."
        items={links}
      />
    </>
  );
}
