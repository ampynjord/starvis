import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SERVER_API_URL } from '@/lib/server-config';
import GalactapediaDetailPage from '@/views/GalactapediaDetailPage';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  try {
    const { id } = await params;
    const res = await fetch(`${SERVER_API_URL}/api/v1/galactapedia/${id}`, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error();
    const { data } = await res.json();
    return {
      title: data.title,
      description: data.excerpt ?? `${data.title} — Star Citizen lore article on STARVIS Galactapedia.`,
      openGraph: {
        title: `${data.title} — Galactapedia`,
        description: data.excerpt ?? `${data.title} — Star Citizen lore article.`,
        ...(data.thumbnail_url ? { images: [{ url: data.thumbnail_url }] } : {}),
      },
    };
  } catch {
    return { title: 'Galactapedia' };
  }
}

export default function Page() {
  return <Suspense><GalactapediaDetailPage /></Suspense>;
}
