import type { Metadata } from 'next';
import MiningPage from '@/views/MiningPage';

export const metadata: Metadata = {
  title: 'Mining',
  description:
    'Star Citizen mining data: minerals, rock compositions, mining elements, instability, resistance and cluster factors extracted from game files.',
  keywords: ['star citizen mining', 'sc mining minerals', 'star citizen rock composition', 'mining elements sc'],
  openGraph: {
    title: 'Mining — STARVIS',
    description: 'Star Citizen mining elements and rock composition database.',
  },
};

export default function Page() {
  return <MiningPage />;
}
