import type { Metadata } from 'next';
import { SeoDetailSnapshot, SeoJsonLd } from '@/components/seo/SeoEntitySnapshot';
import { PUBLIC_SITE_URL } from '@/lib/server-config';
import { serverGet } from '@/lib/server-api';
import type { Component } from '@/types/api';
import ComponentDetailPage from '@/views/ComponentDetailPage';

type PageParams = { params: Promise<{ uuid: string }> };

async function getComponent(uuid: string): Promise<Component | null> {
  return serverGet<Component>(`/components/${encodeURIComponent(uuid)}`, { env: 'live' });
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { uuid } = await params;
  const component = await getComponent(uuid);
  if (!component) return { title: 'Component Details', alternates: { canonical: `/components/${uuid}` } };
  const description =
    component.description ??
    `${component.name} - Star Citizen ${component.sub_type ?? component.type} component stats, size, grade and availability on STARVIS.`;
  return {
    title: component.name,
    description,
    keywords: [component.name, component.type, component.sub_type, component.manufacturer_name, 'star citizen component'].filter(Boolean) as string[],
    alternates: { canonical: `/components/${component.uuid}` },
    openGraph: { title: `${component.name} - STARVIS`, description },
  };
}

export default async function Page({ params }: PageParams) {
  const { uuid } = await params;
  const component = await getComponent(uuid);

  return (
    <>
      {component ? (
        <>
          <SeoJsonLd
            value={{
              '@context': 'https://schema.org',
              '@type': 'Product',
              name: component.name,
              brand: component.manufacturer_name ?? undefined,
              category: component.sub_type ?? component.type,
              description: component.description ?? undefined,
              url: `${PUBLIC_SITE_URL}/components/${component.uuid}`,
            }}
          />
          <SeoDetailSnapshot
            title={component.name}
            description={component.description ?? `${component.name} Star Citizen component data on STARVIS.`}
            facts={[
              component.manufacturer_name,
              component.type,
              component.sub_type,
              component.size ? `size ${component.size}` : null,
              component.grade ? `grade ${component.grade}` : null,
              component.weapon_dps ? `${Math.round(component.weapon_dps)} DPS` : null,
              component.shield_hp ? `${Math.round(component.shield_hp)} shield HP` : null,
              component.qd_speed ? `${Math.round(component.qd_speed)} quantum speed` : null,
            ]}
          />
        </>
      ) : null}
      <ComponentDetailPage />
    </>
  );
}
