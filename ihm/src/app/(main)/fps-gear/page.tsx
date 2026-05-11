import type { Metadata } from 'next';
import ItemsPage from '@/views/ItemsPage';

export const metadata: Metadata = {
  title: 'FPS Gear',
  description:
    'Complete Star Citizen FPS equipment database — armors, helmets, undergarments and backpacks with detailed stats and buy locations.',
  keywords: ['star citizen fps gear', 'star citizen armor', 'sc helmet', 'star citizen equipment', 'fps star citizen'],
  openGraph: {
    title: 'FPS Gear — STARVIS',
    description: 'All Star Citizen FPS armor, helmets and equipment with stats.',
  },
};

export default function Page() {
  return <ItemsPage />;
}
