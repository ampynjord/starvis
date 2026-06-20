import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SeoDetailSnapshot, SeoJsonLd } from '@/components/seo/SeoEntitySnapshot';
import { PUBLIC_SITE_URL } from '@/lib/server-config';
import { serverGet } from '@/lib/server-api';
import type { GalactapediaEntry } from '@/types/api';
import GalactapediaDetailPage from '@/views/GalactapediaDetailPage';

type PageParams = { params: Promise<{ id: string }> };

async function getGalactapediaEntry(id: string): Promise<GalactapediaEntry | null> {
  return serverGet<GalactapediaEntry>(`/galactapedia/${encodeURIComponent(id)}`);
}

function plainText(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function listText(value: string[] | string | null): string | null {
  if (Array.isArray(value)) return value.join(', ');
  return value;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { id } = await params;
  const data = await getGalactapediaEntry(id);
  if (!data) return { title: 'Galactapedia', alternates: { canonical: `/galactapedia/${id}` } };
  const description = data.excerpt ?? plainText(data.content)?.slice(0, 180) ?? `${data.title} - Star Citizen lore article on STARVIS Galactapedia.`;
  return {
    title: data.title,
    description,
    alternates: { canonical: `/galactapedia/${data.slug || data.id}` },
    openGraph: {
      title: `${data.title} - Galactapedia`,
      description,
      ...(data.thumbnail_url ? { images: [{ url: data.thumbnail_url }] } : {}),
    },
  };
}

export default async function Page({ params }: PageParams) {
  const { id } = await params;
  const data = await getGalactapediaEntry(id);

  return (
    <>
      {data ? (
        <>
          <SeoJsonLd
            value={{
              '@context': 'https://schema.org',
              '@type': 'Article',
              headline: data.title,
              description: data.excerpt ?? undefined,
              image: data.thumbnail_url ?? undefined,
              dateModified: data.updated_at ?? undefined,
              mainEntityOfPage: `${PUBLIC_SITE_URL}/galactapedia/${data.slug || data.id}`,
              url: `${PUBLIC_SITE_URL}/galactapedia/${data.slug || data.id}`,
            }}
          />
          <SeoDetailSnapshot
            title={data.title}
            description={data.excerpt ?? plainText(data.content)}
            facts={[listText(data.categories), listText(data.tags), data.updated_at ? `Updated ${data.updated_at}` : null, data.rsi_url]}
          />
        </>
      ) : null}
      <Suspense>
        <GalactapediaDetailPage />
      </Suspense>
    </>
  );
}
