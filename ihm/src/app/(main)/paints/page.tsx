import type { Metadata } from 'next';
import PaintsPage from '@/views/PaintsPage';

export const metadata: Metadata = {
  title: 'Ship Paints',
  description:
    'Browse all Star Citizen ship paints and color schemes. Filter by manufacturer or ship model.',
  keywords: ['star citizen paints', 'sc ship skins', 'star citizen ship colors', 'star citizen liveries'],
  openGraph: {
    title: 'Ship Paints — STARVIS',
    description: 'All Star Citizen ship paints and color schemes.',
  },
};

export default function Page() {
  return <PaintsPage />;
}
