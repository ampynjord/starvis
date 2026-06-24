import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SeoDetailSnapshot, SeoJsonLd } from '@/components/seo/SeoEntitySnapshot';
import { PUBLIC_SITE_URL } from '@/lib/server-config';
import { serverGet } from '@/lib/server-api';
import type { CommLink } from '@/types/api';
import CommLinkDetailPage from '@/views/CommLinkDetailPage';

type PageParams = { params: Promise<{ id: string }> };

async function getCommLink(id: string): Promise<CommLink | null> {
  return serverGet<CommLink>(`/comm-links/${encodeURIComponent(id)}`);
}

function plainText(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { id } = await params;
  const data = await getCommLink(id);
  if (!data) return { title: 'Comm-Link', alternates: { canonical: `/comm-links/${id}` } };
  const description = data.excerpt ?? plainText(data.content)?.slice(0, 180) ?? `${data.title} - Star Citizen Comm-Link from Roberts Space Industries.`;
  return {
    title: data.title,
    description,
    alternates: { canonical: `/comm-links/${data.slug || data.id}` },
    openGraph: {
      title: `${data.title} - Comm-Link`,
      description,
      ...(data.thumbnail_url ? { images: [{ url: data.thumbnail_url }] } : {}),
    },
  };
}

export default async function Page({ params }: PageParams) {
  const { id } = await params;
  const data = await getCommLink(id);

  return (
    <>
      {data ? (
        <>
          <SeoJsonLd
            value={{
              '@context': 'https://schema.org',
              '@type': 'NewsArticle',
              headline: data.title,
              description: data.excerpt ?? undefined,
              image: data.thumbnail_url ?? undefined,
              datePublished: data.published_at ?? undefined,
              mainEntityOfPage: `${PUBLIC_SITE_URL}/comm-links/${data.slug || data.id}`,
              url: `${PUBLIC_SITE_URL}/comm-links/${data.slug || data.id}`,
            }}
          />
          <SeoDetailSnapshot
            title={data.title}
            description={data.excerpt ?? plainText(data.content)}
            facts={[data.category, data.published_at ? `Published ${data.published_at}` : null, data.rsi_url]}
          />
        </>
      ) : null}
      <Suspense>
        <CommLinkDetailPage />
      </Suspense>
    </>
  );
}
