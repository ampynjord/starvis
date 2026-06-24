import type { Metadata } from 'next';
import ItemsPage from '@/views/ItemsPage';

export const metadata: Metadata = {
  title: 'Clothing',
  description: 'Star Citizen clothing database — headwear, shirts, jackets, gloves, legwear, footwear and eyewear.',
  keywords: ['star citizen clothing', 'sc apparel', 'star citizen fashion'],
};

export default function Page() {
  return <ItemsPage group="clothing" />;
}
