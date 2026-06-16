import type { Metadata } from 'next';
import { Suspense } from 'react';
import UniverseExplorerPage from '@/views/UniverseExplorerPage';

export const metadata: Metadata = {
  title: 'Universe & Locations',
  description:
    'Explore the Star Citizen universe: star systems, planets, moons, space stations, outposts and jump points with game data extracted from P4K files.',
  keywords: ['star citizen locations', 'sc universe map', 'star citizen planets', 'sc stations', 'star citizen systems'],
  openGraph: {
    title: 'Universe & Locations — STARVIS',
    description: 'Interactive Star Citizen universe explorer with game-extracted location data.',
  },
};

export default function Page() {
  return (
    <Suspense>
      <UniverseExplorerPage />
    </Suspense>
  );
}
