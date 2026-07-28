import type { Metadata } from 'next';
import { serverGet } from '@/lib/server-api';
import type { Location } from '@/types/api';
import LocationDetailPage from '@/views/LocationDetailPage';

type PageParams = { params: Promise<{ uuid: string }> };

async function getLocation(uuid: string): Promise<Location | null> {
  return serverGet<Location>(`/locations/${encodeURIComponent(uuid)}`, { env: 'live' });
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { uuid } = await params;
  const location = await getLocation(uuid);
  if (!location) return { title: 'Location Details', alternates: { canonical: `/locations/${uuid}` } };
  const description = `${location.name} - Star Citizen ${location.type ?? 'location'} data on STARVIS.`;
  return {
    title: location.name,
    description,
    keywords: [location.name, location.type, location.system_code, 'star citizen location'].filter(Boolean) as string[],
    alternates: { canonical: `/locations/${location.uuid}` },
    openGraph: { title: `${location.name} - STARVIS`, description },
  };
}

export default function Page() {
  return <LocationDetailPage />;
}
