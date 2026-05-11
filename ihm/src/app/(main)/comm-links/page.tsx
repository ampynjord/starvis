import type { Metadata } from 'next';
import { Suspense } from 'react';
import CommLinksPage from '@/views/CommLinksPage';

export const metadata: Metadata = {
  title: 'Comm-Links',
  description:
    'Latest Star Citizen Comm-Links — official news, updates, ship announcements and lore articles from Roberts Space Industries.',
  keywords: ['star citizen news', 'star citizen comm-links', 'RSI news', 'roberts space industries', 'star citizen updates'],
  openGraph: {
    title: 'Comm-Links — STARVIS',
    description: 'Official Star Citizen news and Comm-Links from Roberts Space Industries.',
  },
};

export default function Page() {
  return <Suspense><CommLinksPage /></Suspense>;
}
