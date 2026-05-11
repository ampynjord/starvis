import type { Metadata } from 'next';
import ItemsPage from '@/views/ItemsPage';

export const metadata: Metadata = {
  title: 'Consumables',
  description:
    'Star Citizen consumables database — medical items, food, drinks and recovery items with stats and buy locations.',
  keywords: ['star citizen consumables', 'star citizen medical', 'sc food', 'star citizen healing items'],
  openGraph: {
    title: 'Consumables — STARVIS',
    description: 'All Star Citizen consumable items with stats and locations.',
  },
};

export default function Page() {
  return <ItemsPage />;
}
