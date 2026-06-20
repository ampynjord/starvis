import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SeoEntitySnapshot, SeoJsonLd } from '@/components/seo/SeoEntitySnapshot';
import { collectionJsonLd, getShipSeoLinks } from '@/lib/seo-snapshots';
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

export default async function Page() {
  const links = await getShipSeoLinks();

  return (
    <>
      <SeoJsonLd value={collectionJsonLd('Star Citizen Ships and Vehicles', '/ships', links)} />
      <Suspense>
        <ShipsPage />
      </Suspense>
      <SeoEntitySnapshot
        title="Indexable Star Citizen ship database"
        description="Crawlable STARVIS ship entries with manufacturers, roles and key stats."
        items={links}
      />
    </>
  );
}
