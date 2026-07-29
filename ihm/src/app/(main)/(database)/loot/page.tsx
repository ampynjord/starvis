import type { Metadata } from 'next';
import { Suspense } from 'react';
import LootPage from '@/views/LootPage';

export const metadata: Metadata = {
  title: 'Loot Tables',
  description:
    'What drops from what in Star Citizen: loot tables, weighted entries and the archetypes they draw from, extracted from game files.',
  keywords: ['star citizen loot', 'sc loot tables', 'star citizen drops', 'contested zone loot'],
  alternates: { canonical: '/loot' },
  openGraph: {
    title: 'Loot Tables — STARVIS',
    description: 'Star Citizen loot tables with drop chances and contents.',
  },
};

export default function Page() {
  return (
    <Suspense>
      <LootPage />
    </Suspense>
  );
}
