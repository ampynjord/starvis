import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SERVER_API_KEY, SERVER_API_URL } from '@/lib/server-config';
import CommLinkDetailPage from '@/views/CommLinkDetailPage';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  try {
    const { id } = await params;
    const res = await fetch(`${SERVER_API_URL}/api/v1/comm-links/${id}`, {
      headers: SERVER_API_KEY ? { 'X-API-Key': SERVER_API_KEY, 'X-Starvis-Internal-Client': 'ihm-server-component' } : undefined,
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error();
    const { data } = await res.json();
    return {
      title: data.title,
      description: data.excerpt ?? `${data.title} — Star Citizen Comm-Link from Roberts Space Industries.`,
      openGraph: {
        title: `${data.title} — Comm-Link`,
        description: data.excerpt ?? `${data.title} — CIG Star Citizen news.`,
        ...(data.thumbnail_url ? { images: [{ url: data.thumbnail_url }] } : {}),
      },
    };
  } catch {
    return { title: 'Comm-Link' };
  }
}

export default function Page() {
  return <Suspense><CommLinkDetailPage /></Suspense>;
}
