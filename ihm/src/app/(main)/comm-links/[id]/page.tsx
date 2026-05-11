import type { Metadata } from 'next';
import { Suspense } from 'react';
import CommLinkDetailPage from '@/views/CommLinkDetailPage';

const API_BASE = process.env.API_URL ?? 'http://localhost:3000';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  try {
    const { id } = await params;
    const res = await fetch(`${API_BASE}/api/v1/comm-links/${id}`, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error();
    const { data } = await res.json();
    return {
      title: data.title,
      description: data.excerpt ?? `${data.title} — Star Citizen Comm-Link from Roberts Space Industries.`,
      openGraph: {
        title: `${data.title} — Comm-Link`,
        description: data.excerpt ?? `${data.title} — Official Star Citizen news.`,
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
