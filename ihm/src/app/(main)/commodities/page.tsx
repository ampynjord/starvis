import type { Metadata } from 'next';
import CommoditiesNewPage from '@/views/CommoditiesNewPage';

export const metadata: Metadata = {
  title: 'Commodities & Trade',
  description:
    'Star Citizen commodities database — trade goods, raw materials, refined products with buy and sell locations across the verse.',
  keywords: ['star citizen commodities', 'sc trade goods', 'star citizen trading', 'star citizen cargo', 'aUEC star citizen'],
  openGraph: {
    title: 'Commodities & Trade — STARVIS',
    description: 'All Star Citizen trade commodities with prices and locations.',
  },
};

export default function Page() {
  return <CommoditiesNewPage />;
}
