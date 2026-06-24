import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SeoEntitySnapshot, SeoJsonLd } from '@/components/seo/SeoEntitySnapshot';
import { collectionJsonLd, getGalactapediaSeoLinks } from '@/lib/seo-snapshots';
import GalactapediaPage from '@/views/GalactapediaPage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Galactapedia',
  description:
    'The Star Citizen Galactapedia - in-universe encyclopedia covering lore, factions, locations, species and history of the Star Citizen universe.',
  keywords: ['star citizen lore', 'galactapedia', 'star citizen wiki', 'star citizen universe', 'star citizen history', 'sc lore'],
  alternates: { canonical: '/galactapedia' },
  openGraph: {
    title: 'Galactapedia - STARVIS',
    description: 'Star Citizen in-universe encyclopedia - lore, factions, locations and history.',
  },
};

export default async function Page() {
  const links = await getGalactapediaSeoLinks();

  return (
    <>
      <SeoJsonLd value={collectionJsonLd('Star Citizen Galactapedia', '/galactapedia', links)} />
      <Suspense>
        <GalactapediaPage />
      </Suspense>
      <SeoEntitySnapshot
        title="Indexable Star Citizen Galactapedia"
        description="Crawlable STARVIS lore entries sourced from the Star Citizen Galactapedia."
        items={links}
      />
    </>
  );
}
