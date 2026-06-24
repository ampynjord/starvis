import type { Metadata } from 'next';
import ItemsPage from '@/views/ItemsPage';

export const metadata: Metadata = {
  title: 'Utility',
  description: 'Star Citizen utility items — gadgets, medical equipment, cryptokeys and technology tools.',
  keywords: ['star citizen gadgets', 'sc medical', 'star citizen tools', 'sc cryptokeys'],
};

export default function Page() {
  return <ItemsPage group="utility" />;
}
