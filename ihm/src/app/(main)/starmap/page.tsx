import type { Metadata } from 'next';
import { SeoEntitySnapshot, SeoJsonLd } from '@/components/seo/SeoEntitySnapshot';
import { collectionJsonLd, getStarmapSeoLinks } from '@/lib/seo-snapshots';
import UniverseExplorerPage from '@/views/UniverseExplorerPage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Starvis Starmap',
  description: 'Interactive Star Citizen galaxy map - all star systems, factions and jump tunnel connections.',
  alternates: { canonical: '/starmap' },
  openGraph: {
    title: 'Starvis Starmap - STARVIS',
    description: 'Interactive Star Citizen galaxy map with systems, locations and jump tunnel connections.',
  },
};

export default async function Page() {
  const links = await getStarmapSeoLinks();

  return (
    <>
      <SeoJsonLd value={collectionJsonLd('Star Citizen Starmap', '/starmap', links)} />
      <UniverseExplorerPage />
      <SeoEntitySnapshot
        title="Indexable Star Citizen starmap"
        description="Crawlable RSI starmap entries for systems, celestial bodies, stations, landing zones and jump points."
        items={links}
      />
    </>
  );
}
