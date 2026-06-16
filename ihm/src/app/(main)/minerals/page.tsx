import type { Metadata } from 'next';
import MineralsLibraryPage from '@/views/MineralsLibraryPage';

export const metadata: Metadata = {
  title: 'Minerals Library',
  description:
    'Star Citizen mining minerals reference: instability, resistance, optimal window midpoint, cluster factors and rock composition probabilities.',
  keywords: ['star citizen minerals', 'sc mining minerals', 'star citizen mining elements', 'sc ore database'],
  openGraph: {
    title: 'Minerals Library — STARVIS',
    description: 'Complete Star Citizen mining minerals reference.',
  },
};

export default function Page() {
  return <MineralsLibraryPage />;
}
