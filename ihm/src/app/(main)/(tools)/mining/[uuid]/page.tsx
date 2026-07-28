import type { Metadata } from 'next';
import { serverGet } from '@/lib/server-api';
import type { MiningElement } from '@/types/api';
import MiningElementDetailPage from '@/views/MiningElementDetailPage';

type PageParams = { params: Promise<{ uuid: string }> };

async function getElement(uuid: string): Promise<MiningElement | null> {
  return serverGet<MiningElement>(`/mining/elements/${encodeURIComponent(uuid)}`, { env: 'live' });
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { uuid } = await params;
  const element = await getElement(uuid);
  if (!element) return { title: 'Mineral Details', alternates: { canonical: `/mining/${uuid}` } };
  const description = `${element.name} - Star Citizen mineable element, deposits and mining behaviour on STARVIS.`;
  return {
    title: element.name,
    description,
    keywords: [element.name, 'star citizen mining', 'mineable element'],
    alternates: { canonical: `/mining/${element.uuid}` },
    openGraph: { title: `${element.name} - STARVIS`, description },
  };
}

export default function Page() {
  return <MiningElementDetailPage />;
}
