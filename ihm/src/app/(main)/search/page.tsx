import type { Metadata } from 'next';
import { Suspense } from 'react';
import SearchResultsPage from '@/views/SearchResultsPage';

export const metadata: Metadata = {
  title: 'Search',
  description:
    'Search across all Star Citizen data: ships, components, items, commodities, missions, locations and more.',
  keywords: ['star citizen database search', 'sc data search', 'starvis search'],
  openGraph: {
    title: 'Search — STARVIS',
    description: 'Search the complete Star Citizen database.',
  },
};

export default function Page() {
  return <Suspense><SearchResultsPage /></Suspense>;
}
