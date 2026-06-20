import type { Metadata } from 'next';
import { SeoEntitySnapshot, SeoJsonLd } from '@/components/seo/SeoEntitySnapshot';
import { collectionJsonLd, getItemSeoLinks } from '@/lib/seo-snapshots';
import ItemsPage from '@/views/ItemsPage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'FPS Items',
  description:
    'Browse Star Citizen FPS gear: armor sets, helmets, backpacks, utility items and gadgets. Stats and equipment data extracted from game files.',
  keywords: ['star citizen fps gear', 'sc armor', 'star citizen helmet', 'fps items sc', 'star citizen equipment'],
  alternates: { canonical: '/items' },
  openGraph: {
    title: 'FPS Items - STARVIS',
    description: 'Star Citizen FPS armor, gear and utility item database.',
  },
};

export default async function Page() {
  const links = await getItemSeoLinks();

  return (
    <>
      <SeoJsonLd value={collectionJsonLd('Star Citizen FPS Items', '/items', links)} />
      <ItemsPage />
      <SeoEntitySnapshot
        title="Indexable Star Citizen FPS item database"
        description="Crawlable STARVIS FPS gear entries with item type, manufacturer and key stats."
        items={links}
      />
    </>
  );
}
