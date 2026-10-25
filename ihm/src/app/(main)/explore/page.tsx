import type { Metadata } from 'next';
import { UniverseNexusView } from '@/views/UniverseNexusView';

export const metadata: Metadata = {
  title: 'STARVIS — Explorateur Universel',
  description: 'Exploration fluide et unifiée de tout Star Citizen sans silos.',
};

export default function ExplorePage() {
  return <UniverseNexusView />;
}
