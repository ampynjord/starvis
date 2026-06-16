import type { Metadata } from 'next';
import ItemsPage from '@/views/ItemsPage';

export const metadata: Metadata = {
  title: 'FPS Items',
  description:
    'Browse Star Citizen FPS gear: armor sets, helmets, backpacks, utility items and gadgets. Stats and equipment data extracted from game files.',
  keywords: ['star citizen fps gear', 'sc armor', 'star citizen helmet', 'fps items sc', 'star citizen equipment'],
  openGraph: {
    title: 'FPS Items — STARVIS',
    description: 'Star Citizen FPS armor, gear and utility item database.',
  },
};

export default function Page() {
  return <ItemsPage />;
}
