import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SeoEntitySnapshot, SeoJsonLd } from '@/components/seo/SeoEntitySnapshot';
import { collectionJsonLd, getLocationSeoLinks } from '@/lib/seo-snapshots';
import { UniverseNexusView } from '@/views/UniverseNexusView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Universe & Locations',
  description:
    'Explore the Star Citizen universe: star systems, planets, moons, space stations, outposts and jump points with game data extracted from P4K files.',
  keywords: ['star citizen locations', 'sc universe map', 'star citizen planets', 'sc stations', 'star citizen systems'],
  alternates: { canonical: '/locations' },
  openGraph: {
    title: 'Universe & Locations - STARVIS',
    description: 'Star Citizen locations in the STARVIS Nexus: systems, planets, moons, stations and outposts.',
  },
};

export default async function Page() {
  const links = await getLocationSeoLinks();

  return (
    <>
      <SeoJsonLd value={collectionJsonLd('Star Citizen Universe Locations', '/locations', links)} />
      <Suspense>
        <UniverseNexusView initialCategory="locations" />
      </Suspense>
      <SeoEntitySnapshot
        title="Indexable Star Citizen universe locations"
        description="Crawlable STARVIS location entries for systems, planets, moons, stations, landing zones and jump points."
        items={links}
      />
    </>
  );
}
