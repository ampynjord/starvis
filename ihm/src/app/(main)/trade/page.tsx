import type { Metadata } from 'next';
import TradePage from '@/views/TradePage';

export const metadata: Metadata = {
  title: 'Trade Routes',
  description:
    'Find the best Star Citizen commodity trade routes. Compare buy and sell prices across locations to maximize profit per run.',
  keywords: ['star citizen trade routes', 'sc best trade route', 'star citizen commodities profit', 'aUEC trade'],
  openGraph: {
    title: 'Trade Routes — STARVIS',
    description: 'Best Star Citizen trade routes and commodity market data.',
  },
};

export default function Page() {
  return <TradePage />;
}
