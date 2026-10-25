import type { Metadata } from 'next';
import { SeoEntitySnapshot, SeoJsonLd } from '@/components/seo/SeoEntitySnapshot';
import { collectionJsonLd, getItemSeoLinks } from '@/lib/seo-snapshots';
import ItemsPage from '@/views/ItemsPage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'FPS Items & Equipment',
  description:
    'Browse Star Citizen FPS equipment, weapons, armor sets, undersuits, backpacks, tools and gadgets. Detailed stats extracted directly from game files.',
  keywords: ['star citizen items', 'fps items', 'sc weapons', 'sc armor', 'star citizen gear'],
  alternates: { canonical: '/items' },
  openGraph: {
    title: 'FPS Items & Equipment — STARVIS',
    description: 'Browse Star Citizen FPS weapons, armor, undersuits, and equipment.',
  },
};

export default async function Page() {
  const links = await getItemSeoLinks();

  return (
    <>
      <SeoJsonLd value={collectionJsonLd('Star Citizen FPS Items', '/items', links)} />
      <ItemsPage />
      <SeoEntitySnapshot
        title="Indexable Star Citizen FPS items database"
        description="Crawlable STARVIS item entries with type, sub-type, manufacturer and availability."
        items={links}
      />
    </>
  );
}
