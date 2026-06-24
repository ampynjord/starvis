import type { Metadata } from 'next';
import ManufacturersPage from '@/views/ManufacturersPage';

export const metadata: Metadata = {
  title: 'Manufacturers',
  description:
    'All Star Citizen ship and component manufacturers — AEGIS, RSI, Origin, Drake, Anvil, Crusader and more with their full product catalogues.',
  keywords: ['star citizen manufacturers', 'AEGIS star citizen', 'RSI ships', 'Origin ships', 'Drake star citizen', 'Anvil ships'],
  openGraph: {
    title: 'Manufacturers — STARVIS',
    description: 'All Star Citizen ship and component manufacturers with catalogues.',
  },
};

export default function Page() {
  return <ManufacturersPage />;
}
