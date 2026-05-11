import type { Metadata } from 'next';
import { Suspense } from 'react';
import GalactapediaPage from '@/views/GalactapediaPage';

export const metadata: Metadata = {
  title: 'Galactapedia',
  description:
    'The Star Citizen Galactapedia — in-universe encyclopedia covering lore, factions, locations, species and history of the Star Citizen universe.',
  keywords: ['star citizen lore', 'galactapedia', 'star citizen wiki', 'star citizen universe', 'star citizen history', 'sc lore'],
  openGraph: {
    title: 'Galactapedia — STARVIS',
    description: 'Star Citizen in-universe encyclopedia — lore, factions, locations and history.',
  },
};

export default function Page() {
  return <Suspense><GalactapediaPage /></Suspense>;
}
