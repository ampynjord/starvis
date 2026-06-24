import type { Metadata } from 'next';
import MiningPage from '@/views/MiningPage';

export const metadata: Metadata = {
  title: 'Mining Calculator',
  description:
    'Star Citizen mining calculator: estimate yields, compare mineral compositions and plan your mining runs for maximum efficiency.',
  keywords: ['star citizen mining calculator', 'sc mining yield', 'star citizen mining guide', 'sc ore calculator'],
  openGraph: {
    title: 'Mining Calculator — STARVIS',
    description: 'Star Citizen mining yield and profitability calculator.',
  },
};

export default function Page() {
  return <MiningPage />;
}
