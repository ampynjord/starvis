import type { Metadata } from 'next';
import { SeoEntitySnapshot, SeoJsonLd } from '@/components/seo/SeoEntitySnapshot';
import { collectionJsonLd, getComponentSeoLinks } from '@/lib/seo-snapshots';
import ComponentsPage from '@/views/ComponentsPage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ship Components',
  description:
    'Browse Star Citizen ship components: weapons, shields, quantum drives, thrusters, coolers, power plants and more. Detailed stats extracted from game files.',
  keywords: ['star citizen components', 'sc ship components', 'star citizen weapons', 'star citizen shields', 'quantum drive sc'],
  alternates: { canonical: '/components' },
  openGraph: {
    title: 'Ship Components - STARVIS',
    description: 'Complete Star Citizen ship component database with stats.',
  },
};

export default async function Page() {
  const links = await getComponentSeoLinks();

  return (
    <>
      <SeoJsonLd value={collectionJsonLd('Star Citizen Ship Components', '/components', links)} />
      <ComponentsPage />
      <SeoEntitySnapshot
        title="Indexable Star Citizen ship component database"
        description="Crawlable STARVIS component entries with type, size, manufacturer and key stats."
        items={links}
      />
    </>
  );
}
