import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SeoEntitySnapshot, SeoJsonLd } from '@/components/seo/SeoEntitySnapshot';
import { collectionJsonLd, getCommLinkSeoLinks } from '@/lib/seo-snapshots';
import CommLinksPage from '@/views/CommLinksPage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Comm-Links',
  description:
    'Latest Star Citizen Comm-Links - CIG news, updates, ship announcements and lore articles from Roberts Space Industries.',
  keywords: ['star citizen news', 'star citizen comm-links', 'RSI news', 'roberts space industries', 'star citizen updates'],
  alternates: { canonical: '/comm-links' },
  openGraph: {
    title: 'Comm-Links - STARVIS',
    description: 'CIG Star Citizen news and Comm-Links from Roberts Space Industries.',
  },
};

export default async function Page() {
  const links = await getCommLinkSeoLinks();

  return (
    <>
      <SeoJsonLd value={collectionJsonLd('Star Citizen Comm-Links', '/comm-links', links)} />
      <Suspense>
        <CommLinksPage />
      </Suspense>
      <SeoEntitySnapshot
        title="Indexable Star Citizen Comm-Links"
        description="Crawlable RSI Comm-Link articles mirrored into STARVIS."
        items={links}
      />
    </>
  );
}
