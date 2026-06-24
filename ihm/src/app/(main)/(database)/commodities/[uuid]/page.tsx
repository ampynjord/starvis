import type { Metadata } from 'next';
import { SeoDetailSnapshot, SeoJsonLd } from '@/components/seo/SeoEntitySnapshot';
import { PUBLIC_SITE_URL } from '@/lib/server-config';
import { serverGet } from '@/lib/server-api';
import type { Commodity } from '@/types/api';
import CommodityDetailPage from '@/views/CommodityDetailPage';

type PageParams = { params: Promise<{ uuid: string }> };

async function getCommodity(uuid: string): Promise<Commodity | null> {
  return serverGet<Commodity>(`/commodities/${encodeURIComponent(uuid)}`, { env: 'live' });
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { uuid } = await params;
  const commodity = await getCommodity(uuid);
  if (!commodity) return { title: 'Commodity Details', alternates: { canonical: `/commodities/${uuid}` } };
  const description = `${commodity.name} - Star Citizen commodity type and trading data on STARVIS.`;
  return {
    title: commodity.name,
    description,
    keywords: [commodity.name, commodity.type, commodity.sub_type, commodity.symbol, 'star citizen commodity'].filter(Boolean) as string[],
    alternates: { canonical: `/commodities/${commodity.uuid}` },
    openGraph: { title: `${commodity.name} - STARVIS`, description },
  };
}

export default async function Page({ params }: PageParams) {
  const { uuid } = await params;
  const commodity = await getCommodity(uuid);

  return (
    <>
      {commodity ? (
        <>
          <SeoJsonLd
            value={{
              '@context': 'https://schema.org',
              '@type': 'Product',
              name: commodity.name,
              category: commodity.sub_type ?? commodity.type ?? undefined,
              url: `${PUBLIC_SITE_URL}/commodities/${commodity.uuid}`,
            }}
          />
          <SeoDetailSnapshot
            title={commodity.name}
            description={`${commodity.name} Star Citizen commodity data on STARVIS.`}
            facts={[commodity.type, commodity.sub_type, commodity.symbol, commodity.occupancy_scu ? `${commodity.occupancy_scu} SCU occupancy` : null]}
          />
        </>
      ) : null}
      <CommodityDetailPage />
    </>
  );
}
