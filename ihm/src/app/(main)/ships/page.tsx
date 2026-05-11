import type { Metadata } from 'next';
import { Suspense } from 'react';
import ShipsPage from '@/views/ShipsPage';

export const metadata: Metadata = {
  title: 'Ships & Vehicles',
  description:
    'Browse the complete list of Star Citizen ships and vehicles with detailed stats, 3D hologram viewer, variants and hardpoints. Data extracted directly from game files.',
  keywords: ['star citizen ships', 'star citizen vehicles', 'sc ship list', 'star citizen ship stats', 'star citizen ship database'],
  openGraph: {
    title: 'Ships & Vehicles — STARVIS',
    description: 'Complete Star Citizen ship database with stats, 3D hologram and comparisons.',
  },
};

export default function Page() {
  return <Suspense><ShipsPage /></Suspense>;
}
