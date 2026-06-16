import type { Metadata } from 'next';
import { Suspense } from 'react';
import BlueprintsPage from '@/views/BlueprintsPage';

export const metadata: Metadata = {
  title: 'Crafting Calculator',
  description:
    'Star Citizen crafting calculator: find blueprints, plan ingredients, estimate crafting time and compare slot modifiers.',
  keywords: ['star citizen crafting calculator', 'sc blueprint crafting', 'crafting recipes star citizen', 'star citizen crafting time'],
  openGraph: {
    title: 'Crafting Calculator — STARVIS',
    description: 'Star Citizen crafting blueprint calculator.',
  },
};

export default function Page() {
  return <Suspense><BlueprintsPage /></Suspense>;
}
