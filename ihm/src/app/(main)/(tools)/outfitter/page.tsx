import type { Metadata } from 'next';
import { Suspense } from 'react';
import LoadoutManagerPage from '@/views/LoadoutManagerPage';

export const metadata: Metadata = {
  title: 'Outfitter',
  description:
    'Plan and save Star Citizen ship loadouts. Configure weapons, shields, thrusters and ship components to optimize your build.',
  keywords: ['star citizen outfitter', 'sc ship loadout', 'star citizen build planner', 'ship outfitter sc'],
  openGraph: {
    title: 'Outfitter — STARVIS',
    description: 'Plan and save Star Citizen ship loadouts.',
  },
};

export default function Page() {
  return <Suspense><LoadoutManagerPage /></Suspense>;
}
