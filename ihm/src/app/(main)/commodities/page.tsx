import type { Metadata } from 'next';
import { SeoEntitySnapshot, SeoJsonLd } from '@/components/seo/SeoEntitySnapshot';
import { collectionJsonLd, getCommoditySeoLinks } from '@/lib/seo-snapshots';
import CommoditiesLibraryPage from '@/views/CommoditiesLibraryPage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Commodities & Trade',
  description:
    'Star Citizen commodities database - trade goods, raw materials, refined products with buy and sell locations across the verse.',
  keywords: ['star citizen commodities', 'sc trade goods', 'star citizen trading', 'star citizen cargo', 'aUEC star citizen'],
  alternates: { canonical: '/commodities' },
  openGraph: {
    title: 'Commodities & Trade - STARVIS',
    description: 'All Star Citizen trade commodities with prices and locations.',
  },
};

export default async function Page() {
  const links = await getCommoditySeoLinks();

  return (
    <>
      <SeoJsonLd value={collectionJsonLd('Star Citizen Commodities and Trade Goods', '/commodities', links)} />
      <CommoditiesLibraryPage />
      <SeoEntitySnapshot
        title="Indexable Star Citizen commodities database"
        description="Crawlable STARVIS commodity entries with cargo type, symbol and trade metadata."
        items={links}
      />
    </>
  );
}
