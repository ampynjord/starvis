import type { Metadata } from 'next';
import RankingPage from '@/views/RankingPage';

export const metadata: Metadata = {
  title: 'Ship Rankings',
  description:
    'Ranked lists of the best Star Citizen ships by speed, cargo capacity, DPS, crew size, shield HP and more.',
  keywords: ['best star citizen ships', 'star citizen ship ranking', 'fastest ship star citizen', 'most cargo star citizen'],
  openGraph: {
    title: 'Ship Rankings — STARVIS',
    description: 'Best Star Citizen ships ranked by speed, cargo, DPS and more.',
  },
};

export default function Page() {
  return <RankingPage />;
}
