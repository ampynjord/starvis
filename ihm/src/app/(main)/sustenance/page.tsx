import type { Metadata } from 'next';
import ItemsPage from '@/views/ItemsPage';

export const metadata: Metadata = {
  title: 'Sustenance',
  description: 'Star Citizen food, drinks and oxygen consumables — all sustenance items with stats and buy locations.',
  keywords: ['star citizen food', 'sc drinks', 'star citizen consumables', 'sc oxygen'],
};

export default function Page() {
  return <ItemsPage group="sustenance" />;
}
