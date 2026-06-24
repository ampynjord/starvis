import type { Metadata } from 'next';
import { Suspense } from 'react';
import MissionsPage from '@/views/MissionsPage';

export const metadata: Metadata = {
  title: 'Missions',
  description:
    'Complete Star Citizen mission database — all mission types, factions, rewards and locations. Find the best missions for your playstyle.',
  keywords: ['star citizen missions', 'sc mission list', 'star citizen bounty hunting', 'star citizen delivery missions', 'star citizen jobs'],
  openGraph: {
    title: 'Missions — STARVIS',
    description: 'All Star Citizen missions by type, faction and location.',
  },
};

export default function Page() {
  return <Suspense><MissionsPage /></Suspense>;
}
