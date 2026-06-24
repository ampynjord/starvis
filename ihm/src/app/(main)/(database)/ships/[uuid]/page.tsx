import type { Metadata } from 'next';
import { SeoDetailSnapshot, SeoJsonLd } from '@/components/seo/SeoEntitySnapshot';
import { PUBLIC_SITE_URL } from '@/lib/server-config';
import { serverGet } from '@/lib/server-api';
import type { Ship } from '@/types/api';
import ShipDetailPage from '@/views/ShipDetailPage';

type PageParams = { params: Promise<{ uuid: string }> };

async function getShip(uuid: string): Promise<Ship | null> {
  return serverGet<Ship>(`/ships/${encodeURIComponent(uuid)}`, { env: 'live' });
}

function shipDescription(ship: Ship): string {
  const mfr = ship.manufacturer_name ? `${ship.manufacturer_name} ` : '';
  return `${mfr}${ship.name} - complete stats, hardpoints, variants and 3D hologram on STARVIS. Career: ${ship.career ?? 'N/A'}. SCM speed: ${ship.scm_speed ?? 'N/A'} m/s.`;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { uuid } = await params;
  const ship = await getShip(uuid);
  if (!ship) return { title: 'Ship Details', alternates: { canonical: `/ships/${uuid}` } };
  const description = shipDescription(ship);
  return {
    title: ship.name,
    description,
    keywords: [ship.name, 'star citizen', ship.manufacturer_name, ship.career].filter(Boolean) as string[],
    alternates: { canonical: `/ships/${ship.uuid}` },
    openGraph: { title: `${ship.name} - STARVIS`, description },
  };
}

export default async function Page({ params }: PageParams) {
  const { uuid } = await params;
  const ship = await getShip(uuid);

  return (
    <>
      {ship ? (
        <>
          <SeoJsonLd
            value={{
              '@context': 'https://schema.org',
              '@type': 'Product',
              name: ship.name,
              brand: ship.manufacturer_name ?? undefined,
              category: ship.career ?? ship.role ?? 'Star Citizen ship',
              description: ship.sm_description ?? shipDescription(ship),
              image: ship.thumbnail_large ?? ship.thumbnail ?? undefined,
              url: `${PUBLIC_SITE_URL}/ships/${ship.uuid}`,
            }}
          />
          <SeoDetailSnapshot
            title={ship.name}
            description={ship.sm_description ?? shipDescription(ship)}
            facts={[
              ship.manufacturer_name,
              ship.career,
              ship.role,
              ship.scm_speed ? `${ship.scm_speed} m/s SCM speed` : null,
              ship.max_speed ? `${ship.max_speed} m/s max speed` : null,
              ship.cargo_capacity != null ? `${ship.cargo_capacity} SCU cargo` : null,
              ship.total_hp ? `${ship.total_hp} hull HP` : null,
            ]}
          />
        </>
      ) : null}
      <ShipDetailPage />
    </>
  );
}
