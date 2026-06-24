import type { Metadata } from 'next';
import { SeoDetailSnapshot, SeoJsonLd } from '@/components/seo/SeoEntitySnapshot';
import { PUBLIC_SITE_URL } from '@/lib/server-config';
import { serverGet } from '@/lib/server-api';
import type { Item } from '@/types/api';
import ItemDetailPage from '@/views/ItemDetailPage';

type PageParams = { params: Promise<{ uuid: string }> };

async function getItem(uuid: string): Promise<Item | null> {
  return serverGet<Item>(`/items/${encodeURIComponent(uuid)}`, { env: 'live' });
}

function itemName(item: Item): string {
  return item.display_name ?? item.displayName ?? item.name;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { uuid } = await params;
  const item = await getItem(uuid);
  if (!item) return { title: 'Item Details', alternates: { canonical: `/items/${uuid}` } };
  const name = itemName(item);
  const description = item.description ?? `${name} - Star Citizen FPS item data, stats and availability on STARVIS.`;
  return {
    title: name,
    description,
    keywords: [name, item.type, item.sub_type, item.manufacturer_name, 'star citizen item'].filter(Boolean) as string[],
    alternates: { canonical: `/items/${item.uuid}` },
    openGraph: { title: `${name} - STARVIS`, description },
  };
}

export default async function Page({ params }: PageParams) {
  const { uuid } = await params;
  const item = await getItem(uuid);
  const name = item ? itemName(item) : null;

  return (
    <>
      {item && name ? (
        <>
          <SeoJsonLd
            value={{
              '@context': 'https://schema.org',
              '@type': 'Product',
              name,
              brand: item.manufacturer_name ?? undefined,
              category: item.sub_type ?? item.type,
              description: item.description ?? undefined,
              url: `${PUBLIC_SITE_URL}/items/${item.uuid}`,
            }}
          />
          <SeoDetailSnapshot
            title={name}
            description={item.description ?? `${name} Star Citizen item data on STARVIS.`}
            facts={[
              item.manufacturer_name,
              item.type,
              item.sub_type,
              item.grade ? `grade ${item.grade}` : null,
              item.size ? `size ${item.size}` : null,
              item.weapon_dps ? `${Math.round(item.weapon_dps)} DPS` : null,
              item.armor_damage_reduction ? `${item.armor_damage_reduction}% damage reduction` : null,
            ]}
          />
        </>
      ) : null}
      <ItemDetailPage />
    </>
  );
}
