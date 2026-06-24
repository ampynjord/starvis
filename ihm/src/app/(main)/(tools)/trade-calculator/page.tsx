import type { Metadata } from 'next';
import TradePage from '@/views/TradePage';

export const metadata: Metadata = {
  title: 'Trade Calculator',
  description:
    'Star Citizen trade route calculator: find the most profitable commodity runs, compare prices and estimate aUEC profit per trip.',
  keywords: ['star citizen trade calculator', 'sc trade profit', 'best trade routes sc', 'star citizen aUEC farming'],
  openGraph: {
    title: 'Trade Calculator — STARVIS',
    description: 'Star Citizen trade route profit calculator.',
  },
};

export default function Page() {
  return <TradePage />;
}
