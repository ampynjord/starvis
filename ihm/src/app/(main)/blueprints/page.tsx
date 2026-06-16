import type { Metadata } from 'next';
import { Suspense } from 'react';
import BlueprintsPage from '@/views/BlueprintsPage';

export const metadata: Metadata = {
  title: 'Blueprints & Crafting',
  description:
    'Browse Star Citizen crafting blueprints and mission blueprint rewards. Recipes, ingredients, crafting times and slot modifiers extracted from game files.',
  keywords: ['star citizen blueprints', 'star citizen crafting', 'sc crafting recipes', 'blueprint rewards', 'star citizen crafting calculator'],
  openGraph: {
    title: 'Blueprints & Crafting — STARVIS',
    description: 'Star Citizen crafting recipes and blueprint rewards database.',
  },
};

export default function Page() {
  return <Suspense><BlueprintsPage /></Suspense>;
}
